#!/usr/bin/env python3
"""
Stable Diffusion inference script for ComputeGrid Worker
This script is called by the Electron app to generate images.
"""

import sys
import os
import json
import time
import base64
from io import BytesIO

def log(message):
    """Log to stderr for the Electron app to capture"""
    print(f"[SD] {message}", file=sys.stderr, flush=True)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided", "success": False}))
        return 1
    
    try:
        # Parse input from command line
        input_data = json.loads(sys.argv[1])
        
        prompt = input_data.get("prompt", "a beautiful landscape")
        seed = input_data.get("seed", 42)
        width = input_data.get("width", 512)
        height = input_data.get("height", 512)
        model_path = input_data.get("model_path", "")
        output_path = input_data.get("output_path", "")
        is_benchmark = input_data.get("is_benchmark", False)
        
        log(f"Starting image generation: {width}x{height}, seed={seed}")
        log(f"Prompt: {prompt[:50]}...")
        
        start_time = time.time()
        
        # Import torch and diffusers here to measure load time
        log("Loading PyTorch and diffusers...")
        import torch
        from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
        
        log(f"PyTorch version: {torch.__version__}")
        log(f"CUDA available: {torch.cuda.is_available()}")
        
        if torch.cuda.is_available():
            device = "cuda"
            dtype = torch.float16
            log(f"Using CUDA device: {torch.cuda.get_device_name(0)}")
            log(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB")
        else:
            device = "cpu"
            dtype = torch.float32
            log("Using CPU (this will be slow)")
        
        # Load the model
        log("Loading Stable Diffusion model...")
        
        if model_path and os.path.exists(model_path):
            # Load from local safetensors file
            log(f"Loading from local file: {model_path}")
            pipe = StableDiffusionPipeline.from_single_file(
                model_path,
                torch_dtype=dtype,
                use_safetensors=True
            )
        else:
            # Load from Hugging Face (fallback)
            log("Loading from Hugging Face cache...")
            pipe = StableDiffusionPipeline.from_pretrained(
                "runwayml/stable-diffusion-v1-5",
                torch_dtype=dtype
            )
        
        # Use faster scheduler
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
        pipe = pipe.to(device)
        
        # Enable memory optimizations
        if device == "cuda":
            pipe.enable_attention_slicing()
            try:
                pipe.enable_xformers_memory_efficient_attention()
                log("xFormers enabled")
            except Exception as e:
                log(f"xFormers not available: {e}")
        
        model_load_time = time.time() - start_time
        log(f"Model loaded in {model_load_time:.1f}s")
        
        # Set random seed for reproducibility
        generator = torch.Generator(device=device).manual_seed(seed)
        
        # Generate the image
        log("Generating image...")
        gen_start = time.time()
        
        num_steps = 20 if is_benchmark else 25
        
        result = pipe(
            prompt,
            width=width,
            height=height,
            num_inference_steps=num_steps,
            guidance_scale=7.5,
            generator=generator
        )
        
        image = result.images[0]
        gen_time = time.time() - gen_start
        total_time = time.time() - start_time
        
        log(f"Image generated in {gen_time:.1f}s (total: {total_time:.1f}s)")
        
        # Convert image to base64
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        
        # Save to file if output path specified
        if output_path:
            image.save(output_path, format="PNG")
            log(f"Image saved to: {output_path}")
        
        # Return result as JSON
        result = {
            "success": True,
            "image_base64": image_base64,
            "width": width,
            "height": height,
            "seed": seed,
            "model_load_time_ms": int(model_load_time * 1000),
            "generation_time_ms": int(gen_time * 1000),
            "total_time_ms": int(total_time * 1000),
            "device": device
        }
        
        print(json.dumps(result))
        return 0
        
    except ImportError as e:
        log(f"Import error: {e}")
        print(json.dumps({
            "success": False,
            "error": f"Missing dependency: {e}",
            "error_type": "import_error"
        }))
        return 1
        
    except Exception as e:
        error_str = str(e)
        error_type = "general"
        error_msg = error_str
        
        # Check for CUDA OOM
        if "CUDA out of memory" in error_str or "OutOfMemoryError" in type(e).__name__:
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
