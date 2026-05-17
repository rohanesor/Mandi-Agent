"""
Benchmark report generator.

Analyzes benchmark results and generates accuracy, precision, recall metrics
per disease class and per prompt version.
"""

import json
from collections import defaultdict
from pathlib import Path


def normalize_disease_name(name: str) -> str:
    name = name.lower().strip()
    replacements = {
        "early blight": "early_blight",
        "late blight": "late_blight",
        "bacterial spot": "bacterial_spot",
        "purple blotch": "purple_blotch",
        "anthracnose": "anthracnose",
        "powdery mildew": "powdery_mildew",
        "leaf curl": "leaf_curl",
        "target spot": "target_spot",
        "septoria leaf spot": "septoria_leaf_spot",
        "spider mites": "spider_mites",
        "yellow leaf curl virus": "yellow_leaf_curl_virus",
        "mosaic virus": "mosaic_virus",
        "rice blast": "blast",
        "brown spot": "brown_spot",
        "bacterial leaf blight": "bacterial_leaf_blight",
        "rust": "rust",
        "common rust": "rust",
        "cedar rust": "cedar_rust",
        "cedar apple rust": "cedar_rust",
        "northern leaf blight": "northern_leaf_blight",
        "cercospora leaf spot": "cercospora_leaf_spot",
        "gray leaf spot": "cercospora_leaf_spot",
        "black rot": "black_rot",
        "esca": "esca",
        "leaf blight": "leaf_blight",
        "scab": "scab",
        "downy mildew": "downy_mildew",
        "healthy": "healthy",
        "unknown": "unknown",
    }
    for k, v in replacements.items():
        if k in name:
            return v
    return name.replace(" ", "_").replace("-", "_")


def compute_metrics(predictions: list[dict]) -> dict:
    by_version = defaultdict(list)
    for p in predictions:
        by_version[p["prompt_version"]].append(p)

    report = {"versions": {}}

    for version, preds in by_version.items():
        version_metrics = compute_single_version_metrics(preds)
        report["versions"][version] = version_metrics

    return report


def compute_single_version_metrics(preds: list[dict]) -> dict:
    total = len(preds)
    correct = 0
    errors = 0

    confusion = defaultdict(lambda: defaultdict(int))
    by_crop = defaultdict(list)
    by_disease = defaultdict(lambda: {"total": 0, "correct": 0, "confidences": []})
    confidence_bins = defaultdict(lambda: {"total": 0, "correct": 0})

    for p in preds:
        pred = p.get("prediction", {})
        if "error" in pred:
            errors += 1
            continue

        gt = normalize_disease_name(p["ground_truth"])
        predicted = normalize_disease_name(pred.get("predicted_disease", "unknown"))
        confidence = pred.get("confidence", 0.5)
        crop = p["crop"]

        confusion[gt][predicted] += 1
        by_disease[gt]["total"] += 1
        by_disease[gt]["confidences"].append(confidence)

        if gt == predicted:
            correct += 1
            by_disease[gt]["correct"] += 1

        by_crop[crop].append(gt == predicted)

        bin_key = f"{int(confidence * 10) * 10}-{int(confidence * 10) * 10 + 9}"
        confidence_bins[bin_key]["total"] += 1
        if gt == predicted:
            confidence_bins[bin_key]["correct"] += 1

    accuracy = correct / max(1, total - errors)

    per_disease_metrics = {}
    for disease, stats in by_disease.items():
        tp = stats["correct"]
        fp = sum(
            1
            for p in preds
            if normalize_disease_name(p.get("prediction", {}).get("predicted_disease", "")) == disease
            and p["ground_truth"] != disease
        )
        fn = stats["total"] - tp

        precision = tp / max(1, tp + fp)
        recall = tp / max(1, tp + fn)
        f1 = 2 * (precision * recall) / max(0.001, precision + recall)

        avg_confidence = sum(stats["confidences"]) / max(1, len(stats["confidences"]))

        per_disease_metrics[disease] = {
            "total": stats["total"],
            "correct": tp,
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1_score": round(f1, 3),
            "avg_confidence": round(avg_confidence, 3),
        }

    per_crop_metrics = {}
    for crop, results in by_crop.items():
        crop_correct = sum(results)
        crop_total = len(results)
        per_crop_metrics[crop] = {
            "accuracy": round(crop_correct / max(1, crop_total), 3),
            "correct": crop_correct,
            "total": crop_total,
        }

    calibration = {}
    for bin_key, stats in sorted(confidence_bins.items()):
        if stats["total"] > 0:
            calibration[bin_key] = {
                "accuracy": round(stats["correct"] / stats["total"], 3),
                "total": stats["total"],
            }

    return {
        "accuracy": round(accuracy, 3),
        "total_images": total,
        "correct": correct,
        "errors": errors,
        "per_disease": per_disease_metrics,
        "per_crop": per_crop_metrics,
        "confidence_calibration": calibration,
        "confusion_matrix": {k: dict(v) for k, v in confusion.items()},
    }


def generate_report(
    benchmark_path: str,
    output_path: str | None = None,
) -> dict:
    data = json.loads(Path(benchmark_path).read_text())
    report = compute_metrics(data["predictions"])

    report["run_info"] = {
        "timestamp": data["run_timestamp"],
        "model": data["model"],
        "total_images": data["total_images"],
        "prompt_versions_tested": data["prompt_versions"],
    }

    print("\n" + "=" * 80)
    print("BENCHMARK REPORT")
    print(f"Model: {report['run_info']['model']}")
    print(f"Images: {report['run_info']['total_images']}")
    print(f"Versions: {', '.join(report['run_info']['prompt_versions_tested'])}")
    print("=" * 80)

    for version, metrics in report["versions"].items():
        print(f"\n--- {version} ---")
        print(
            f"  Accuracy: {metrics['accuracy']:.1%} ({metrics['correct']}/{metrics['total_images']}, {metrics['errors']} errors)"
        )

        print("\n  Per Crop:")
        for crop, cm in sorted(metrics["per_crop"].items()):
            print(f"    {crop:15s}: {cm['accuracy']:.1%} ({cm['correct']}/{cm['total']})")

        print("\n  Per Disease:")
        for disease, dm in sorted(metrics["per_disease"].items(), key=lambda x: x[1]["f1_score"], reverse=True):
            print(
                f"    {disease:25s}: P={dm['precision']:.2f} R={dm['recall']:.2f} F1={dm['f1_score']:.2f} (n={dm['total']})"
            )

        print("\n  Confidence Calibration:")
        for bin_key, cal in sorted(metrics["confidence_calibration"].items()):
            print(f"    {bin_key}%: {cal['accuracy']:.1%} (n={cal['total']})")

    if output_path:
        Path(output_path).write_text(json.dumps(report, indent=2))
        print(f"\nReport saved to: {output_path}")

    return report


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python benchmark_report.py <benchmark_results.json> [output_report.json]")
        sys.exit(1)
    benchmark_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    generate_report(benchmark_file, output_file)
