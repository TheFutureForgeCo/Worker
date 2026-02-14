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
import gc
import torch
import numpy as np
from io import BytesIO
from PIL import Image

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

def generate_tiled(pipe, prompt, negative_prompt, width, height, num_steps, guidance_scale, seed, use_sdxl):
    """Generate a large image by splitting into overlapping tiles and stitching together.
    Used as a fallback when the full image is too large for GPU VRAM."""
    tile_size = 512
    overlap = 64

    log(f"TILED GENERATION: {width}x{height} with {tile_size}x{tile_size} tiles, {overlap}px overlap")

    cols = max(1, int(np.ceil((width - overlap) / (tile_size - overlap))))
    rows = max(1, int(np.ceil((height - overlap) / (tile_size - overlap))))
    total_tiles = cols * rows
    log(f"Tile grid: {cols}x{rows} = {total_tiles} tiles")

    final_image = Image.new('RGB', (width, height))
    blend_mask_h = None
    blend_mask_v = None

    for row in range(rows):
        for col in range(cols):
            tile_num = row * cols + col + 1
            log(f"Generating tile {tile_num}/{total_tiles} [{col},{row}]...")

            x_start = col * (tile_size - overlap)
            y_start = row * (tile_size - overlap)

            tile_w = min(tile_size, width - x_start)
            tile_h = min(tile_size, height - y_start)
            tile_w = ((tile_w + 7) // 8) * 8
            tile_h = ((tile_h + 7) // 8) * 8

            tile_seed = seed + row * cols + col
            gen = torch.Generator()
            gen.manual_seed(tile_seed)

            region_hint = f", seamless tile region {col+1}/{cols} horizontal {row+1}/{rows} vertical"
            tile_prompt = prompt + region_hint

            try:
                result = pipe(
                    tile_prompt,
                    negative_prompt=negative_prompt,
                    width=tile_w,
                    height=tile_h,
                    num_inference_steps=num_steps,
                    guidance_scale=guidance_scale,
                    generator=gen,
                )
            except TypeError:
                result = pipe(
                    tile_prompt,
                    negative_prompt=negative_prompt,
                    width=tile_w,
                    height=tile_h,
                    num_inference_steps=num_steps,
                    guidance_scale=guidance_scale,
                )

            tile_img = result.images[0]
            log(f"Tile {tile_num} generated: {tile_img.size}")

            if col == 0 and row == 0:
                final_image.paste(tile_img, (x_start, y_start))
            else:
                tile_arr = np.array(tile_img).astype(np.float32)

                x_end = x_start + tile_w
                y_end = y_start + tile_h
                x_end = min(x_end, width)
                y_end = min(y_end, height)
                paste_w = x_end - x_start
                paste_h = y_end - y_start

                existing_region = np.array(final_image.crop((x_start, y_start, x_end, y_end))).astype(np.float32)
                tile_cropped = tile_arr[:paste_h, :paste_w]

                alpha = np.ones((paste_h, paste_w, 1), dtype=np.float32)

                if col > 0 and overlap > 0:
                    blend_width = min(overlap, paste_w)
                    for i in range(blend_width):
                        alpha[:, i, 0] = i / blend_width

                if row > 0 and overlap > 0:
                    blend_height = min(overlap, paste_h)
                    for i in range(blend_height):
                        alpha[i, :, 0] *= i / blend_height

                blended = (tile_cropped * alpha + existing_region * (1.0 - alpha)).astype(np.uint8)
                final_image.paste(Image.fromarray(blended), (x_start, y_start))

            log(f"Tile {tile_num} placed at ({x_start},{y_start})")

    log("Tiled generation complete - all tiles stitched")
    return final_image


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
        use_sdxl = input_data.get("use_sdxl", False)
        
        # Default negative prompt for better quality - avoids common artifacts
        default_negative = "blurry, low quality, distorted, deformed, ugly, bad anatomy, disfigured, poorly drawn, extra limbs, mutated, grainy, noisy, watermark, text, logo"
        negative_prompt = input_data.get("negative_prompt", default_negative)
        
        # Log SDXL mode
        if use_sdxl:
            log("Using SDXL model for high quality generation")
        
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
        sdxl_fell_back_to_sd15 = False
        
        # Import the appropriate pipeline based on model type
        if use_sdxl:
            try:
                from optimum.onnxruntime import ORTStableDiffusionXLPipeline as ORTPipelineXL
            except ImportError as e:
                log(f"ERROR: ORTStableDiffusionXLPipeline not available!")
                log(f"Import error: {e}")
                log("Falling back to SD 1.5 standard quality")
                use_sdxl = False
                sdxl_fell_back_to_sd15 = True
        
        if use_sdxl:
            ORTPipeline = ORTPipelineXL
            default_model_id = "stabilityai/sdxl-turbo"
            log("Using SDXL-Turbo pipeline")
        else:
            from optimum.onnxruntime import ORTStableDiffusionPipeline as ORTPipeline
            default_model_id = "runwayml/stable-diffusion-v1-5"
            log("Using SD 1.5 pipeline (ORTStableDiffusionPipeline)")
        
        pipe = None
        actual_provider = None
        provider_verified = False
        nsfw_filter_disabled = False
        
        # Determine ONNX cache path for this model
        onnx_model_id = model_id if model_id else default_model_id
        has_local_cache = model_dir and os.path.exists(os.path.join(model_dir, "model_index.json"))
        
        # --- SDXL: Export once to cache, then load from cache ---
        if use_sdxl and not has_local_cache:
            log("No local ONNX cache found for SDXL-Turbo. Exporting once...")
            log("This downloads the model and converts to ONNX (first time only).")
            log("NOTE: export=True requires significant RAM. If this fails, will fall back to SD 1.5.")
            
            try:
                log(f"Exporting SDXL model to ONNX: {onnx_model_id}")
                export_pipe = ORTPipeline.from_pretrained(
                    onnx_model_id,
                    export=True,
                    provider='CPUExecutionProvider'
                )
                
                if model_dir:
                    log(f"Saving ONNX model to local cache: {model_dir}")
                    os.makedirs(model_dir, exist_ok=True)
                    export_pipe.save_pretrained(model_dir)
                    has_local_cache = True
                    log("ONNX export saved successfully!")
                
                del export_pipe
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                log("Freed export memory. Will now load from cache with GPU provider.")
                
            except Exception as export_err:
                err_str = str(export_err).lower()
                log(f"SDXL export failed: {export_err}")
                
                if ("bad allocation" in err_str or "out of memory" in err_str or
                    "memory" in err_str or "allocat" in err_str):
                    log("SDXL-Turbo requires too much memory to export on this system.")
                else:
                    log(f"SDXL export error (non-memory): {export_err}")
                
                log("Falling back to SD 1.5 standard quality...")
                use_sdxl = False
                sdxl_fell_back_to_sd15 = True
                
                del export_err
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                from optimum.onnxruntime import ORTStableDiffusionPipeline as ORTPipeline
                default_model_id = "runwayml/stable-diffusion-v1-5"
                onnx_model_id = default_model_id
                has_local_cache = False
                log("Switched to SD 1.5 pipeline")
        
        # --- Load pipeline from cache or download (works for both SD 1.5 and cached SDXL) ---
        for provider_name, provider_desc in providers_to_try:
            log(f"Attempting to load with {provider_name}...")
            try:
                if has_local_cache:
                    log(f"Loading from local ONNX cache: {model_dir}")
                    pipe = ORTPipeline.from_pretrained(
                        model_dir,
                        provider=provider_name
                    )
                else:
                    if use_sdxl:
                        raise Exception("SDXL ONNX cache not found - export phase should have created it. Cannot load SDXL without cache.")
                    
                    log(f"Downloading SD 1.5 model: {onnx_model_id}")
                    try:
                        log(f"Loading pre-exported ONNX model...")
                        pipe = ORTPipeline.from_pretrained(
                            onnx_model_id,
                            revision="onnx",
                            provider=provider_name
                        )
                    except Exception as onnx_err:
                        log(f"ONNX revision failed: {onnx_err}")
                        log(f"Exporting model to ONNX format...")
                        pipe = ORTPipeline.from_pretrained(
                            onnx_model_id,
                            export=True,
                            provider=provider_name
                        )
                    
                    if model_dir and not has_local_cache:
                        log(f"Saving ONNX model to: {model_dir}")
                        os.makedirs(model_dir, exist_ok=True)
                        pipe.save_pretrained(model_dir)
                        has_local_cache = True
                
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
                err_str = str(load_err).lower()
                log(f"Failed to load with {provider_name}: {load_err}")
                
                if "bad allocation" in err_str or "out of memory" in err_str:
                    log(f"{provider_name} failed due to memory limits")
                elif provider_name == 'CUDAExecutionProvider':
                    log("CUDA failed - this usually means CUDA Toolkit is not installed.")
                    log("Or the system will fall back to DirectML/CPU.")
                
                pipe = None
                continue
        
        # If SDXL loaded from cache but ALL providers failed, fall back to SD 1.5
        if pipe is None and use_sdxl:
            log("SDXL-Turbo failed with all providers. Falling back to SD 1.5...")
            use_sdxl = False
            sdxl_fell_back_to_sd15 = True
            
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            from optimum.onnxruntime import ORTStableDiffusionPipeline as ORTPipeline
            default_model_id = "runwayml/stable-diffusion-v1-5"
            onnx_model_id = default_model_id
            
            for provider_name, provider_desc in providers_to_try:
                log(f"[SD1.5 fallback] Attempting {provider_name}...")
                try:
                    try:
                        pipe = ORTPipeline.from_pretrained(
                            onnx_model_id,
                            revision="onnx",
                            provider=provider_name
                        )
                    except Exception:
                        pipe = ORTPipeline.from_pretrained(
                            onnx_model_id,
                            export=True,
                            provider=provider_name
                        )
                    
                    actual_provider = provider_name
                    provider_verified = True
                    log(f"[SD1.5 fallback] SUCCESS with {provider_name}")
                    break
                except Exception as fb_err:
                    log(f"[SD1.5 fallback] Failed with {provider_name}: {fb_err}")
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
        
        # SDXL-Turbo uses very few steps (1-4) with no guidance needed
        # SD 1.5 uses 35 steps with guidance 7.5
        # If we fell back from SDXL to SD 1.5, override the user's SDXL settings
        user_steps = input_data.get("num_steps", None)
        user_guidance = input_data.get("guidance_scale", None)
        
        if use_sdxl:
            num_steps = 2 if is_benchmark else (min(max(user_steps, 1), 4) if user_steps else 4)
            guidance_scale = 0.0
        else:
            if sdxl_fell_back_to_sd15:
                num_steps = 20 if is_benchmark else 25
                guidance_scale = 7.5
                log("Using SD 1.5 defaults (overriding SDXL settings after fallback)")
            else:
                num_steps = 20 if is_benchmark else (min(max(user_steps, 5), 50) if user_steps else 35)
                guidance_scale = user_guidance if user_guidance is not None else 7.5
        
        log(f"Inference steps: {num_steps}")
        log(f"Guidance scale: {guidance_scale}")
        log(f"Negative prompt: {negative_prompt[:50]}...")
        
        gen_start = time.time()
        log("Starting inference...")
        
        used_tiling = False
        
        sdxl_max_native = 512
        needs_tiling = use_sdxl and (width > sdxl_max_native or height > sdxl_max_native)
        
        if needs_tiling:
            log(f"SDXL-Turbo native resolution is {sdxl_max_native}x{sdxl_max_native}")
            log(f"Requested {width}x{height} exceeds native size - using tiled generation")
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
            
            try:
                image = generate_tiled(
                    pipe, prompt, negative_prompt,
                    width, height, num_steps, guidance_scale, seed, use_sdxl
                )
            except Exception as tile_err:
                log(f"SDXL tiled generation failed: {tile_err}")
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                gc.collect()
                raise
            used_tiling = True
        else:
            try:
                try:
                    result = pipe(
                        prompt,
                        negative_prompt=negative_prompt,
                        width=width,
                        height=height,
                        num_inference_steps=num_steps,
                        guidance_scale=guidance_scale,
                        generator=generator,
                    )
                except TypeError as e:
                    log(f"Generator parameter not supported, running without it: {e}")
                    result = pipe(
                        prompt,
                        negative_prompt=negative_prompt,
                        width=width,
                        height=height,
                        num_inference_steps=num_steps,
                        guidance_scale=guidance_scale,
                    )
                image = result.images[0]
            except Exception as oom_err:
                err_str = str(oom_err).lower()
                err_type = type(oom_err).__name__
                is_oom = ("out of memory" in err_str or
                          "outofmemory" in err_type.lower() or
                          "cuda out of memory" in err_str or
                          "failed to allocat" in err_str or
                          "memory allocation" in err_str or
                          "insufficient memory" in err_str or
                          "bad allocation" in err_str or
                          "runtime_exception" in err_str or
                          "the parameter is incorrect" in err_str or
                          "non-zero status code" in err_str)
                
                if is_oom and (width > 512 or height > 512):
                    log(f"Full image generation failed: {oom_err}")
                    log("Falling back to tiled generation...")
                    
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    
                    image = generate_tiled(
                        pipe, prompt, negative_prompt,
                        width, height, num_steps, guidance_scale, seed, use_sdxl
                    )
                    used_tiling = True
                else:
                    raise
        
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
        if not used_tiling:
            log(f"Time per step: {gen_time / num_steps:.3f}s")
        else:
            log(f"Used tiled generation (local stitching)")
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
        # Convert to native Python bool for JSON serialization
        is_blank = bool((img_max - img_min) < 5)
        
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
            "used_tiling": used_tiling,
            "sdxl_fallback_to_sd15": sdxl_fell_back_to_sd15,
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
