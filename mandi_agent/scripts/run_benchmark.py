"""
Benchmark setup and runner.

Downloads PlantVillage dataset, samples images, runs benchmark, generates report.
"""

import json
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from mandi_agent.backend.agents.benchmark_dataset import sample_dataset
from mandi_agent.backend.agents.benchmark_report import generate_report
from mandi_agent.backend.agents.benchmark_runner import run_benchmark


def setup_env():
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                os.environ[key.strip()] = value.strip()
        print(f"Loaded environment from {env_path}")


async def run_full_benchmark(
    samples_per_class: int = 10,
    dataset_dir: str = "data/plantdisease",
    benchmark_dir: str = "data/benchmark_sample",
    results_dir: str = "data/benchmark_results",
):
    setup_env()
    print("=" * 70)
    print("MANDI AGENT - DISEASE DETECTION BENCHMARK")
    print("=" * 70)

    # Step 1: Check dataset
    print("\n[1/4] Checking PlantVillage dataset...")
    if not Path(dataset_dir).exists():
        print("Dataset not found. Please download:")
        print("  git clone https://github.com/spMohanty/PlantVillage-Dataset.git data/plantdisease")
        return

    # Step 2: Sample images
    print(f"\n[2/4] Sampling {samples_per_class} images per class...")
    sample_dataset(
        dataset_dir=dataset_dir,
        samples_per_class=samples_per_class,
        output_dir=benchmark_dir,
    )

    # Step 3: Run benchmark
    print("\n[3/4] Running benchmark...")
    await run_benchmark(
        manifest_path=f"{benchmark_dir}/manifest.json",
        prompt_versions=["v0_baseline", "v1_expert_context", "v2_multi_shot", "v3_chain_of_thought"],
        model_key="flash_2_0",
        output_dir=results_dir,
        delay_between_requests=0.3,
    )

    # Step 4: Generate report
    print("\n[4/4] Generating report...")
    benchmark_files = list(Path(results_dir).glob("*.json"))
    if benchmark_files:
        latest = max(benchmark_files, key=lambda f: f.stat().st_mtime)
        report = generate_report(
            benchmark_path=str(latest),
            output_path=f"{results_dir}/report_latest.json",
        )

        # Save summary
        summary = {
            "model": report["run_info"]["model"],
            "total_images": report["run_info"]["total_images"],
            "versions": {},
        }
        for version, metrics in report["versions"].items():
            summary["versions"][version] = {
                "accuracy": metrics["accuracy"],
                "correct": metrics["correct"],
                "total": metrics["total_images"],
                "best_crop": max(metrics["per_crop"].items(), key=lambda x: x[1]["accuracy"]),
                "worst_crop": min(metrics["per_crop"].items(), key=lambda x: x[1]["accuracy"]),
            }

        summary_path = Path(results_dir) / "summary.json"
        summary_path.write_text(json.dumps(summary, indent=2))
        print(f"\nSummary saved to: {summary_path}")
    else:
        print("No benchmark results found.")


if __name__ == "__main__":
    import asyncio

    asyncio.run(run_full_benchmark())
