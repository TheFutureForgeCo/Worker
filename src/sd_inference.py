#!/usr/bin/env python3
"""
Stable Diffusion ONNX inference script for ComputeGrid Worker
Uses ONNX Runtime instead of PyTorch for better Windows compatibility.
"""

import sys
import os
import json
import time
import base64
from io import BytesIO

def log(message):
    """Log to stderr for the Electron app to capture"""
    print(f"[SD-ONNX] {message}", file=sys.stderr, flush=True)

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
        
        log(f"Starting ONNX image generation: {width}x{height}, seed={seed}")
        log(f"Prompt: {prompt[:50]}...")
        
        start_time = time.time()
        
        log("Loading ONNX Runtime and dependencies...")
        import numpy as np
        import onnxruntime as ort
        
        log(f"ONNX Runtime version: {ort.__version__}")
        
        providers = ort.get_available_providers()
        log(f"Available providers: {providers}")
        
        use_cuda = 'CUDAExecutionProvider' in providers
        use_dml = 'DmlExecutionProvider' in providers
        
        if use_cuda:
            provider = 'CUDAExecutionProvider'
            log("Using CUDA acceleration")
        elif use_dml:
            provider = 'DmlExecutionProvider'
            log("Using DirectML acceleration (Windows)")
        else:
            provider = 'CPUExecutionProvider'
            log("Using CPU (this will be slow)")
        
        log("Loading Stable Diffusion ONNX pipeline...")
        
        from diffusers import OnnxStableDiffusionPipeline
        
        if model_dir and os.path.exists(os.path.join(model_dir, "model_index.json")):
            log(f"Loading from local ONNX model: {model_dir}")
            pipe = OnnxStableDiffusionPipeline.from_pretrained(
                model_dir,
                provider=provider
            )
        else:
            log(f"Downloading pre-exported ONNX model from Hugging Face...")
            pipe = OnnxStableDiffusionPipeline.from_pretrained(
                "tlwu/stable-diffusion-v1-5",
                revision="fp16",
                provider=provider
            )
            if model_dir:
                log(f"Saving ONNX model to: {model_dir}")
                os.makedirs(model_dir, exist_ok=True)
                pipe.save_pretrained(model_dir)
        
        model_load_time = time.time() - start_time
        log(f"Model loaded in {model_load_time:.1f}s")
        
        np.random.seed(seed)
        
        log("Generating image...")
        gen_start = time.time()
        
        num_steps = 20 if is_benchmark else 25
        
        result = pipe(
            prompt,
            width=width,
            height=height,
            num_inference_steps=num_steps,
            guidance_scale=7.5,
        )
        
        image = result.images[0]
        gen_time = time.time() - gen_start
        total_time = time.time() - start_time
        
        log(f"Image generated in {gen_time:.1f}s (total: {total_time:.1f}s)")
        
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        
        if output_path:
            image.save(output_path, format="PNG")
            log(f"Image saved to: {output_path}")
        
        result = {
            "success": True,
            "image_base64": image_base64,
            "width": width,
            "height": height,
            "seed": seed,
            "model_load_time_ms": int(model_load_time * 1000),
            "generation_time_ms": int(gen_time * 1000),
            "total_time_ms": int(total_time * 1000),
            "provider": provider
        }
        
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
