"""
Quick benchmark test using sample images from the web.

Downloads 5-10 test images per crop to validate the benchmark pipeline works.
Full PlantVillage benchmark requires dataset download.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Sample images from publicly available sources (PlantVillage preview images)
SAMPLE_IMAGES = {
    "tomato": {
        "early_blight": [
            "https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Tomato___Early_blight/0a122342.jpg",
        ],
        "healthy": [
            "https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Tomato___healthy/0003.jpg",
        ],
    },
    "potato": {
        "late_blight": [
            "https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Potato___Late_blight/0001.jpg",
        ],
        "healthy": [
            "https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Potato___healthy/0001.jpg",
        ],
    },
}


async def download_sample_images(output_dir: str = "data/benchmark_sample") -> list[dict]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    manifest = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for crop, diseases in SAMPLE_IMAGES.items():
            crop_dir = output_path / crop
            crop_dir.mkdir(exist_ok=True)

            for disease, urls in diseases.items():
                for url in urls:
                    try:
                        print(f"Downloading: {url}")
                        response = await client.get(url)
                        if response.status_code == 200:
                            filename = url.split("/")[-1]
                            filepath = crop_dir / filename
                            filepath.write_bytes(response.content)

                            manifest.append({
                                "crop": crop,
                                "disease": disease,
                                "ground_truth": f"{crop}___{disease.title()}",
                                "image_path": str(filepath),
                                "image_hash": "",
                                "class_dir": f"{crop}___{disease.title()}",
                            })
                            print(f"  Saved: {filepath}")
                        else:
                            print(f"  Failed: HTTP {response.status_code}")
                    except Exception as e:
                        print(f"  Error: {e}")

    manifest_path = output_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"\nDownloaded {len(manifest)} sample images")
    return manifest


async def run_quick_benchmark():
    # Load environment from .env
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                os.environ[key.strip()] = value.strip()

    print("Quick Benchmark: Disease Detection Pipeline Test")
    print("=" * 60)

    # Step 1: Download samples
    print("\n[1/3] Downloading sample images...")
    manifest = await download_sample_images()

    if not manifest:
        print("No images downloaded. Check internet connection.")
        return

    # Step 2: Run benchmark
    print("\n[2/3] Running disease detection...")
    from mandi_agent.backend.agents.benchmark_runner import run_benchmark

    results = await run_benchmark(
        manifest_path="data/benchmark_sample/manifest.json",
        prompt_versions=["v0_baseline", "v1_expert_context"],
        model_key="flash_2_0",
        output_dir="data/benchmark_results",
        delay_between_requests=1.0,
    )

    # Step 3: Generate report
    print("\n[3/3] Generating report...")
    from mandi_agent.backend.agents.benchmark_report import generate_report

    benchmark_files = list(Path("data/benchmark_results").glob("*.json"))
    if benchmark_files:
        latest = max(benchmark_files, key=lambda f: f.stat().st_mtime)
        generate_report(
            benchmark_path=str(latest),
            output_path="data/benchmark_results/report_quick.json",
        )


if __name__ == "__main__":
    asyncio.run(run_quick_benchmark())
