import os
import gc
import logging
from typing import Generator, Optional
import torch

logger = logging.getLogger(__name__)

# Hugging Face GGUF Model Configs
MODEL_CONFIGS = {
    "fast": {
        "repo_id": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "name": "Qwen2.5-1.5B-Instruct-Q4_K_M"
    },
    "detailed": {
        "repo_id": "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "filename": "qwen2.5-3b-instruct-q4_k_m.gguf",
        "name": "Qwen2.5-3B-Instruct-Q4_K_M"
    }
}

class LLMManager:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.llm_weights_dir = os.path.join(self.base_dir, "weights", "llm")
        self.llm = None
        self.current_model = None

    def _normalize_model_type(self, model_type: str) -> str:
        """Map frontend model aliases to active local GGUF keys."""
        if model_type not in MODEL_CONFIGS:
            if model_type == "brief":
                return "fast"
            return "detailed"
        return model_type

    def _ensure_weights_exist(self, model_type: str) -> str:
        """
        Check if GGUF model weights exist locally.
        If missing, download programmatically using huggingface_hub.
        """
        model_type = self._normalize_model_type(model_type)
        config = MODEL_CONFIGS.get(model_type)
        if not config:
            raise ValueError(f"Unknown model type: {model_type}")

        os.makedirs(self.llm_weights_dir, exist_ok=True)
        local_path = os.path.join(self.llm_weights_dir, config["filename"])

        if os.path.exists(local_path):
            logger.info("[llm] found local GGUF weights: %s", local_path)
            return local_path

        logger.info("[llm] GGUF weights missing. Downloading %s from HuggingFace...", config["name"])
        try:
            from huggingface_hub import hf_hub_download
            downloaded_path = hf_hub_download(
                repo_id=config["repo_id"],
                filename=config["filename"],
                local_dir=self.llm_weights_dir,
                local_dir_use_symlinks=False
            )
            logger.info("[llm] successfully downloaded GGUF weights to %s", downloaded_path)
            return downloaded_path
        except Exception as e:
            logger.error("[llm] failed to download weights: %s: %s", type(e).__name__, e)
            raise RuntimeError(f"Failed to download offline LLM weights: {e}") from e

    def load_model(self, model_type: str = "detailed"):
        """
        Dynamically load a model into system RAM.
        If a different model is currently loaded, it unloads it first to save memory.
        """
        model_type = self._normalize_model_type(model_type)
        if self.llm is not None:
            if self.current_model == model_type:
                logger.info("[llm] requested model %s already loaded", model_type)
                return
            else:
                logger.info("[llm] switching model from %s to %s", self.current_model, model_type)
                self.unload_model()

        weights_path = self._ensure_weights_exist(model_type)

        try:
            from llama_cpp import Llama

            # Use LOW_POWER=1 env var for powerbank/demo mode (2 threads instead of 4).
            # This prevents USB voltage sag from crashing the Pi 5 under inference load.
            low_power = os.environ.get("LOW_POWER", "0") == "1"
            n_threads = 2 if low_power else 4
            logger.info("[llm] loading GGUF model: %s (n_threads=%d, low_power=%s)",
                        weights_path, n_threads, low_power)
            self.llm = Llama(
                model_path=weights_path,
                n_ctx=2048,
                n_threads=n_threads,
                n_batch=256 if low_power else 512,  # smaller batches = lower peak current
                verbose=False
            )
            self.current_model = model_type
            logger.info("[llm] GGUF model loaded successfully.")
        except Exception as e:
            logger.error("[llm] failed to initialize Llama CPP: %s: %s", type(e).__name__, e)
            self.llm = None
            self.current_model = None
            raise e

    def unload_model(self):
        """
        Unload the model and trigger active garbage collection.
        This releases occupied RAM back to the operating system immediately.
        """
        if self.llm is not None:
            logger.info("[llm] unloading model %s to free memory...", self.current_model)
            del self.llm
            self.llm = None
            self.current_model = None
            
            # Explicitly collect garbage
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info("[llm] RAM freed successfully.")

    def generate(self, prompt: str, system_prompt: str, max_tokens: int = 512) -> Generator[str, None, None]:
        """
        Generates text character-by-character as a generator for streaming support.
        """
        if self.llm is None:
            raise RuntimeError("LLM is not loaded. Call load_model() first.")

        # Standard Qwen chat template formatting
        formatted_prompt = (
            f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
            f"<|im_start|>user\n{prompt}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )

        try:
            response = self.llm(
                formatted_prompt,
                max_tokens=max_tokens,
                stop=["<|im_end|>", "<|im_start|>", "assistant"],
                stream=True
            )
            for chunk in response:
                text = chunk["choices"][0]["text"]
                yield text
        except Exception as e:
            logger.error("[llm] error during generation: %s", e)
            yield f"\n[LLM Generation Error: {e}]"

# Singleton instance to be imported globally across FastAPI endpoints
llm_manager = LLMManager()
