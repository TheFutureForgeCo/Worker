#!/usr/bin/env python3
"""
Stable Diffusion ONNX inference script for ComputeGrid Worker
Uses ONNX Runtime instead of PyTorch for better Windows compatibility.
"""

import sys
import os
import warnings

# Suppress warnings BEFORE any other imports
# This prevents CUDA/autocast warnings from appearing
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'  # Suppress transformers warnings

warnings.filterwarnings("ignore", message=".*CUDA is not available.*")
warnings.filterwarnings("ignore", message=".*torch_xla.*")
warnings.filterwarnings("ignore", message=".*autocast.*")
warnings.filterwarnings("ignore", message=".*Disabling autocast.*")
warnings.filterwarnings("ignore", category=UserWarning, module="diffusers")
warnings.filterwarnings("ignore", category=UserWarning, module="transformers")
warnings.filterwarnings("ignore", category=FutureWarning)

import json
import time
import base64
import torch
from io import BytesIO

def log(message):
    """Log to stderr for the Electron app to capture"""
    print(f"[SD-ONNX] {message}", file=sys.stderr, flush=True)

def log_gpu_info():
    """Log detailed GPU information for debugging"""
    try:
        import torch
        log(f"PyTorch version: {torch.__version__}")
        log(f"PyTorch CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            log(f"PyTorch CUDA version: {torch.version.cuda}")
            log(f"GPU count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                log(f"GPU {i}: {props.name}, {props.total_memory / 1024**3:.1f} GB VRAM")
    except Exception as e:
        log(f"PyTorch GPU info error: {e}")
    
    try:
        import onnxruntime as ort
        log(f"ONNX Runtime version: {ort.__version__}")
        log(f"ONNX Runtime available providers: {ort.get_available_providers()}")
        
        # Check if CUDA provider has actual GPU devices
        if 'CUDAExecutionProvider' in ort.get_available_providers():
            try:
                # Create a test session to verify CUDA works
                sess_options = ort.SessionOptions()
                sess_options.log_severity_level = 3  # Suppress logs
                log("CUDA provider detected - will attempt GPU inference")
            except Exception as e:
                log(f"CUDA provider check error: {e}")
    except Exception as e:
        log(f"ONNX Runtime info error: {e}")

def verify_provider_in_use(pipe, expected_provider):
    """Verify which provider the pipeline is actually using"""
    try:
        # Check the unet session (main compute component)
        if hasattr(pipe, 'unet') and hasattr(pipe.unet, 'session'):
            session = pipe.unet.session
            providers_in_use = session.get_providers()
            log(f"UNET session providers: {providers_in_use}")
            
            if expected_provider in providers_in_use:
                log(f"VERIFIED: {expected_provider} is active for UNET")
                return True
            else:
                log(f"WARNING: Expected {expected_provider} but got {providers_in_use}")
                return False
        else:
            log("Could not access pipeline session to verify provider")
            return None
    except Exception as e:
        log(f"Provider verification error: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided", "success": False}))
        return 1
    
    try:
        input_data = json.loads(sys.argv[1])
        
        prompt = input_data.get("prompt", "a beautiful landscape")
        seed = input_data.get("seed", 42)
        width = input_data.get("width", 512)
        height = input_data.get("height", 512)
        model_dir = input_data.get("model_dir", "")
        model_id = input_data.get("model_id", "runwayml/stable-diffusion-v1-5")
        output_path = input_data.get("output_path", "")
        is_benchmark = input_data.get("is_benchmark", False)
        
        # CRITICAL: Round dimensions to multiple of 8 for ONNX compatibility
        # ONNX models require dimensions divisible by 8 to avoid tensor shape mismatches
        original_width, original_height = width, height
        width = ((width + 7) // 8) * 8
        height = ((height + 7) // 8) * 8
        if width != original_width or height != original_height:
            log(f"Adjusted dimensions from {original_width}x{original_height} to {width}x{height} (must be divisible by 8)")
        
        log("=" * 60)
        log("BENCHMARK START" if is_benchmark else "IMAGE GENERATION START")
        log("=" * 60)
        log(f"Image size: {width}x{height}, seed={seed}")
        log(f"Prompt: {prompt[:50]}...")
        log(f"Model dir: {model_dir}")
        log(f"Is benchmark: {is_benchmark}")
        
        start_time = time.time()
        
        # Step 1: Log system info
        log("-" * 40)
        log("STEP 1: System Information")
        log("-" * 40)
        log_gpu_info()
        
        # Step 2: Load ONNX Runtime
        log("-" * 40)
        log("STEP 2: Loading ONNX Runtime")
        log("-" * 40)
        import numpy as np
        import onnxruntime as ort
        
        providers = ort.get_available_providers()
        log(f"Available execution providers: {providers}")
        
        use_cuda = 'CUDAExecutionProvider' in providers
        use_dml = 'DmlExecutionProvider' in providers
        
        log(f"CUDA provider available: {use_cuda}")
        log(f"DirectML provider available: {use_dml}")
        
        # Determine provider priority with fallback chain
        # IMPORTANT: DirectML first on Windows - works without CUDA Toolkit installation
        # CUDA often shows as "available" but fails at runtime if CUDA Toolkit not installed (Error 126)
        # DirectML works with any GPU (NVIDIA, AMD, Intel) through Windows native APIs
        providers_to_try = []
        if use_dml:
            providers_to_try.append(('DmlExecutionProvider', 'Windows GPU (DirectML)'))
        if use_cuda:
            providers_to_try.append(('CUDAExecutionProvider', 'NVIDIA GPU (CUDA)'))
        providers_to_try.append(('CPUExecutionProvider', 'CPU (SLOW!)'))
        
        # Select initial provider (may fall back later if it fails)
        provider, provider_desc = providers_to_try[0]
        log(f"SELECTED: {provider} ({provider_desc})")
        
        # Step 3: Load pipeline with provider fallback
        log("-" * 40)
        log("STEP 3: Loading Stable Diffusion Pipeline")
        log("-" * 40)
        
        pipeline_load_start = time.time()
        from optimum.onnxruntime import ORTStableDiffusionPipeline
        
        pipe = None
        actual_provider = None
        provider_verified = False
        nsfw_filter_disabled = False
        
        # Try each provider in order until one works
        for provider_name, provider_desc in providers_to_try:
            log(f"Attempting to load with {provider_name}...")
            try:
                if model_dir and os.path.exists(os.path.join(model_dir, "model_index.json")):
                    log(f"Loading from local ONNX model: {model_dir}")
                    pipe = ORTStableDiffusionPipeline.from_pretrained(
                        model_dir,
                        provider=provider_name
                    )
                else:
                    # Use pre-exported ONNX model
                    onnx_model_id = "runwayml/stable-diffusion-v1-5"
                    log(f"Downloading pre-exported ONNX model...")
                    try:
                        pipe = ORTStableDiffusionPipeline.from_pretrained(
                            onnx_model_id,
                            revision="onnx",
                            provider=provider_name
                        )
                    except Exception as onnx_err:
                        log(f"ONNX revision failed: {onnx_err}")
                        pipe = ORTStableDiffusionPipeline.from_pretrained(
                            onnx_model_id,
                            export=True,
                            provider=provider_name
                        )
                    
                    # Save for future use
                    if model_dir:
                        log(f"Saving ONNX model to: {model_dir}")
                        os.makedirs(model_dir, exist_ok=True)
                        pipe.save_pretrained(model_dir)
                
                # Check if the provider is actually active
                if hasattr(pipe, 'unet') and hasattr(pipe.unet, 'session'):
                    session_providers = pipe.unet.session.get_providers()
                    if provider_name in session_providers:
                        actual_provider = provider_name
                        provider_verified = True
                        log(f"SUCCESS: {provider_name} is active")
                        break
                    else:
                        log(f"WARNING: {provider_name} requested but got {session_providers}")
                        # If we got CPU when we asked for GPU, try the next provider
                        if provider_name != 'CPUExecutionProvider' and 'CPUExecutionProvider' in session_providers:
                            log(f"Falling back to next provider...")
                            pipe = None
                            continue
                        actual_provider = session_providers[0] if session_providers else 'CPUExecutionProvider'
                        break
                else:
                    actual_provider = provider_name
                    log(f"Loaded with {provider_name} (provider verification unavailable)")
                    break
                    
            except Exception as load_err:
                log(f"Failed to load with {provider_name}: {load_err}")
                if provider_name == 'CUDAExecutionProvider':
                    log("CUDA failed - this usually means CUDA Toolkit is not installed.")
                    log("Install CUDA Toolkit from https://developer.nvidia.com/cuda-downloads")
                    log("Or the system will fall back to DirectML/CPU.")
                pipe = None
                continue
        
        if pipe is None:
            raise Exception("Failed to load pipeline with any provider")
        
        provider = actual_provider or provider
        log(f"Pipeline loaded successfully with {provider}")
        
        # Disable NSFW safety checker to prevent black images
        # The safety checker replaces "inappropriate" content with black images
        if hasattr(pipe, 'safety_checker') and pipe.safety_checker is not None:
            log("Disabling NSFW safety checker (causes black images for filtered content)")
            pipe.safety_checker = None
            nsfw_filter_disabled = True
        if hasattr(pipe, 'feature_extractor'):
            pipe.feature_extractor = None
        log(f"Safety checker status: {'Disabled' if nsfw_filter_disabled else 'Not present'}")
        
        pipeline_load_time = time.time() - pipeline_load_start
        log(f"Pipeline loaded in {pipeline_load_time:.2f}s")
        
        # Step 4: Confirm provider status
        log("-" * 40)
        log("STEP 4: Provider Status")
        log("-" * 40)
        log(f"Active provider: {provider}")
        if provider == 'CPUExecutionProvider':
            log("WARNING: Running on CPU only - image generation will be VERY slow!")
            log("For faster generation, install CUDA Toolkit (NVIDIA) or use DirectML (AMD/Intel).")
        elif provider == 'DmlExecutionProvider':
            log("Using DirectML - good performance on Windows GPUs")
        elif provider == 'CUDAExecutionProvider':
            log("Using CUDA - optimal performance on NVIDIA GPUs")
        
        # Step 5: Generate image
        log("-" * 40)
        log("STEP 5: Generating Image")
        log("-" * 40)
        
        # Create a proper random generator for reproducible results
        # Use torch.Generator for reproducible random state
        # Note: diffusers pipeline expects torch.Generator, not numpy.random.RandomState
        generator = torch.Generator()
        generator.manual_seed(seed)
        log(f"Random seed set: {seed}")
        
        num_steps = 20 if is_benchmark else 25
        log(f"Inference steps: {num_steps}")
        log(f"Guidance scale: 7.5")
        
        gen_start = time.time()
        log("Starting inference...")
        
        # Some ONNX pipelines don't support generator parameter
        # Try with generator first, fall back without
        try:
            result = pipe(
                prompt,
                width=width,
                height=height,
                num_inference_steps=num_steps,
                guidance_scale=7.5,
                generator=generator,
            )
        except TypeError as e:
            log(f"Generator parameter not supported, running without it: {e}")
            result = pipe(
                prompt,
                width=width,
                height=height,
                num_inference_steps=num_steps,
                guidance_scale=7.5,
            )
        
        image = result.images[0]
        
        # Validate image is not blank (all black or all white)
        img_array = np.array(image)
        img_min = img_array.min()
        img_max = img_array.max()
        img_mean = img_array.mean()
        log(f"Image stats - min: {img_min}, max: {img_max}, mean: {img_mean:.2f}")
        
        if img_max - img_min < 5:
            log("WARNING: Image appears to be blank (very low variance)")
            log("This may indicate a model loading or inference issue")
        gen_time = time.time() - gen_start
        total_time = time.time() - start_time
        
        # Step 6: Results
        log("-" * 40)
        log("STEP 6: Results")
        log("-" * 40)
        log(f"Generation time: {gen_time:.2f}s")
        log(f"Pipeline load time: {pipeline_load_time:.2f}s")
        log(f"Total time: {total_time:.2f}s")
        log(f"Time per step: {gen_time / num_steps:.3f}s")
        log(f"Provider used: {provider}")
        
        # Performance analysis
        if gen_time < 8:
            log("PERFORMANCE: EXCELLENT (GPU working correctly)")
        elif gen_time < 15:
            log("PERFORMANCE: GOOD (GPU acceleration active)")
        elif gen_time < 25:
            log("PERFORMANCE: SLOW (May be using CPU or suboptimal settings)")
        else:
            log("PERFORMANCE: VERY SLOW (Likely using CPU instead of GPU)")
        
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        
        if output_path:
            image.save(output_path, format="PNG")
            log(f"Image saved to: {output_path}")
        
        log("=" * 60)
        log("BENCHMARK COMPLETE" if is_benchmark else "GENERATION COMPLETE")
        log("=" * 60)
        
        # Check if image is blank (indicates a problem)
        is_blank = (img_max - img_min) < 5
        
        result = {
            "success": True,
            "image_base64": image_base64,
            "width": width,
            "height": height,
            "seed": seed,
            "model_load_time_ms": int(pipeline_load_time * 1000),
            "generation_time_ms": int(gen_time * 1000),
            "total_time_ms": int(total_time * 1000),
            "provider": provider,
            "provider_verified": provider_verified,
            "nsfw_filter_disabled": nsfw_filter_disabled,
            "image_stats": {
                "min": int(img_min),
                "max": int(img_max),
                "mean": float(img_mean),
                "is_blank": is_blank
            }
        }
        
        if is_blank:
            log("ERROR: Generated image is blank!")
            log("Possible causes:")
            log("  1. ONNX model not properly loaded")
            log("  2. Wrong execution provider")
            log("  3. Corrupted model files - try redownloading")
            log("  4. Safety checker blocked the image (should be disabled)")
            result["warning"] = "Image appears blank - may indicate model issue"
        
        print(json.dumps(result))
        return 0
        
    except ImportError as e:
        log(f"Import error: {e}")
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {e}. Try reinstalling Image AI.",
            "error_type": "import_error"
        }))
        return 1
        
    except Exception as e:
        error_str = str(e)
        error_type = "general"
        error_msg = error_str
        
        if "out of memory" in error_str.lower() or "OutOfMemoryError" in type(e).__name__:
            error_type = "oom"
            error_msg = "GPU out of memory - try smaller image size"
        
        log(f"Error ({error_type}): {error_str}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            "success": False,
            "error": error_msg,
            "error_type": error_type
        }))
        return 1

if __name__ == "__main__":
    sys.exit(main())
