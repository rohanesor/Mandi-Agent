"""
Benchmark setup - downloads sample images from PlantVillage and runs benchmark.

Fetches real filenames from GitHub API to ensure successful downloads.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import httpx

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Target class dirs and how many files to download from each
TARGET_DIRS = [
    ("Tomato___Early_blight", "early_blight"),
    ("Tomato___healthy", "healthy"),
    ("Potato___Late_blight", "late_blight"),
    ("Potato___healthy", "healthy"),
    ("Potato___Early_blight", "early_blight"),
    ("Corn_(maize)___healthy", "healthy"),
    ("Corn_(maize)___Common_rust_", "common_rust"),
    ("Apple___healthy", "healthy"),
    ("Apple___Scab", "scab"),
    ("Grape___healthy", "healthy"),
    ("Grape___Black_rot", "black_rot"),
]

GITHUB_API = "https://api.github.com/repos/spMohanty/PlantVillage-Dataset/contents/raw/color"


async def get_files(class_dir: str, limit: int = 3) -> list[str]:
    url = f"{GITHUB_API}/{quote(class_dir)}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url)
        if resp.status_code == 200:
            items = resp.json()
            jpgs = [i["name"] for i in items if i["name"].endswith(".JPG")]
            return jpgs[:limit]
        print(f"  API error for {class_dir}: {resp.status_code}")
        return []


async def download_samples(output_dir: str = "data/benchmark_sample") -> list[dict]:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    manifest = []

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for class_dir, disease in TARGET_DIRS:
            print(f"\nFetching files for: {class_dir}")
            files = await get_files(class_dir, limit=3)

            if not files:
                print("  No files found, skipping.")
                continue

            for filename in files:
                url = f"https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/{quote(class_dir)}/{quote(filename)}"
                try:
                    print(f"  Downloading: {filename[:50]}...")
                    response = await client.get(url)
                    if response.status_code == 200 and len(response.content) > 5000:
                        crop = class_dir.split("___")[0].lower().replace("(maize)", "").strip()
                        crop_dir = output_path / crop
                        crop_dir.mkdir(exist_ok=True)

                        safe_name = filename
                        filepath = crop_dir / safe_name
                        filepath.write_bytes(response.content)

                        manifest.append(
                            {
                                "crop": crop,
                                "disease": disease,
                                "ground_truth": class_dir,
                                "image_path": str(filepath),
                                "image_hash": "",
                                "class_dir": class_dir,
                            }
                        )
                        print(f"    OK: {filepath.name} ({len(response.content)} bytes)")
                    else:
                        print(f"    Skip: HTTP {response.status_code}, size: {len(response.content)}")
                except Exception as e:
                    print(f"    Error: {e}")

    manifest_path = output_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nDownloaded {len(manifest)} sample images")
    return manifest


async def run_quick_benchmark():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                os.environ[key.strip()] = value.strip()

    print("=" * 70)
    print("QUICK BENCHMARK: Disease Detection Pipeline Test")
    print("=" * 70)

    print("\n[1/3] Downloading sample images from PlantVillage...")
    manifest = await download_samples()

    if len(manifest) < 2:
        print("\nNot enough images downloaded for benchmark.")
        print("\nManual dataset setup:")
        print(
            "  cd mandi_agent && git clone --depth 1 https://github.com/spMohanty/PlantVillage-Dataset.git data/plantdisease"
        )
        return

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))

    print("\n[2/3] Running disease detection (v0 vs v1)...")
    from mandi_agent.backend.agents.benchmark_runner import run_benchmark

    output_path = Path("data/benchmark_sample")
    await run_benchmark(
        manifest_path=str(output_path / "manifest.json"),
        prompt_versions=["v0_baseline", "v1_expert_context"],
        model_key="flash_2_0",
        output_dir="data/benchmark_results",
        delay_between_requests=1.5,
    )

    print("\n[3/3] Generating report...")
    from mandi_agent.backend.agents.benchmark_report import generate_report

    results_dir = Path("data/benchmark_results")
    results_dir.mkdir(parents=True, exist_ok=True)
    benchmark_files = list(results_dir.glob("*.json"))
    if benchmark_files:
        latest = max(benchmark_files, key=lambda f: f.stat().st_mtime)
        generate_report(
            benchmark_path=str(latest),
            output_path="data/benchmark_results/report_quick.json",
        )


if __name__ == "__main__":
    asyncio.run(run_quick_benchmark())
