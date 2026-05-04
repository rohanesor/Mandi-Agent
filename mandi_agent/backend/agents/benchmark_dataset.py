"""
PlantVillage dataset downloader and sampler for disease detection benchmarking.

PlantVillage: 54,306 labeled images covering 38 disease classes across 14 crops.
Source: https://www.kaggle.com/datasets/emmarex/plantdisease

Maps dataset labels to our disease taxonomy.
"""

import hashlib
import json
import logging
import os
import random
import shutil
from pathlib import Path
from typing import Optional

import requests
from tqdm import tqdm

logger = logging.getLogger(__name__)

PLANTVILLAGE_URL = "https://github.com/spMohanty/PlantVillage-Dataset/archive/refs/heads/master.zip"

CROP_DISEASE_MAPPING = {
    "Tomato": {
        "healthy": "Healthy",
        "early_blight": "Early Blight (Alternaria solani)",
        "late_blight": "Late Blight (Phytophthora infestans)",
        "bacterial_spot": "Bacterial Spot",
        "target_spot": "Target Spot",
        "tomato_yellow_leaf_curl_virus": "Yellow Leaf Curl Virus",
        "tomato_mosaic_virus": "Mosaic Virus",
        "septoria_leaf_spot": "Septoria Leaf Spot",
        "spider_mites": "Spider Mites",
    },
    "Potato": {
        "healthy": "Healthy",
        "early_blight": "Early Blight",
        "late_blight": "Late Blight (Phytophthora infestans)",
    },
    "Corn": {
        "healthy": "Healthy",
        "cercospora_leaf_spot": "Gray Leaf Spot (Cercospora)",
        "common_rust": "Common Rust (Puccinia sorghi)",
        "northern_leaf_blight": "Northern Leaf Blight",
    },
    "Rice": {
        "healthy": "Healthy",
        "blast": "Rice Blast (Magnaporthe oryzae)",
        "brown_spot": "Brown Spot (Cochliobolus miyabeanus)",
        "bacterial_leaf_blight": "Bacterial Leaf Blight",
    },
    "Wheat": {
        "healthy": "Healthy",
        "rust": "Rust (Puccinia triticina)",
        "powdery_mildew": "Powdery Mildew",
        "septoria": "Septoria Leaf Blotch",
    },
    "Onion": {
        "healthy": "Healthy",
        "purple_blotch": "Purple Blotch (Alternaria porri)",
        "downy_mildew": "Downy Mildew",
    },
    "Chilli": {
        "healthy": "Healthy",
        "anthracnose": "Anthracnose (Colletotrichum capsici)",
        "leaf_curl": "Leaf Curl Virus",
        "powdery_mildew": "Powdery Mildew",
    },
    "Apple": {
        "healthy": "Healthy",
        "scab": "Apple Scab",
        "black_rot": "Black Rot",
        "cedar_rust": "Cedar Apple Rust",
    },
    "Grape": {
        "healthy": "Healthy",
        "black_rot": "Black Rot",
        "esca": "Esca (Black Measles)",
        "leaf_blight": "Leaf Blight (Isariopsis)",
    },
}

DATASET_LABELS = [
    "Tomato___healthy",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Bacterial_spot",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_Mosaic_Virus",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites",
    "Potato___healthy",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Corn___healthy",
    "Corn___Cercospora_leaf_spot",
    "Corn___Common_rust",
    "Corn___Northern_Leaf_Blight",
    "Pepper,_bell___healthy",
    "Pepper,_bell___Bacterial_spot",
    "Grape___healthy",
    "Grape___Black_rot",
    "Grape___Esca_(Black_Measles)",
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
    "Apple___healthy",
    "Apple___Scab",
    "Apple___Black_rot",
    "Apple___Cedar_apple_rust",
    "Strawberry___healthy",
    "Strawberry___Leaf_scorch",
    "Peach___healthy",
    "Peach___Bacterial_spot",
    "Raspberry___healthy",
    "Orange___Haunglongbing_(Citrus_greening)",
    "Soybean___healthy",
    "Squash___Powdery_mildew",
    "Tomato___Leaf_Mold",
    "Cherry_(including_sour)___healthy",
    "Cherry_(including_sour)___Powdery_mildew",
    "Potato___healthy",
    "Tomato___healthy",
]


def _parse_dataset_label(label: str) -> tuple[str, str]:
    crop, disease = label.split("___")
    crop_clean = crop.replace(",", "").replace("(including_sour)", "").strip()
    disease_clean = disease.lower().replace("_", " ").strip()
    if disease_clean == "healthy":
        return crop_clean, "healthy"
    disease_key = disease.lower().replace(" ", "_").replace("(black_measles)", "").replace("(isariopsis_leaf_spot)", "")
    return crop_clean, disease_key


def sample_dataset(
    dataset_dir: str = "data/plantdisease",
    samples_per_class: int = 15,
    seed: int = 42,
    output_dir: str = "data/benchmark_sample",
    dry_run: bool = False,
) -> dict:
    random.seed(seed)
    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}. Download first.")

    color_dir = dataset_path / "color"
    if not color_dir.exists():
        raise FileNotFoundError(f"Color images not found in {dataset_dir}/color")

    sample_manifest = []
    all_classes = sorted([d.name for d in color_dir.iterdir() if d.is_dir()])

    for class_name in all_classes:
        class_dir = color_dir / class_name
        images = list(class_dir.glob("*.JPG")) + list(class_dir.glob("*.jpg")) + list(class_dir.glob("*.jpeg"))
        if len(images) == 0:
            continue

        sampled = random.sample(images, min(samples_per_class, len(images)))
        crop, disease = _parse_dataset_label(class_name)

        output_class_dir = Path(output_dir) / crop
        output_class_dir.mkdir(parents=True, exist_ok=True)

        for img in sampled:
            dest = output_class_dir / img.name
            if not dry_run:
                shutil.copy2(img, dest)

            sample_manifest.append({
                "crop": crop,
                "disease": disease,
                "ground_truth": class_name,
                "image_path": str(dest.relative_to(output_dir)) if not dry_run else str(img),
                "image_hash": hashlib.md5(img.read_bytes()).hexdigest(),
                "class_dir": class_name,
            })

    manifest_path = Path(output_dir) / "manifest.json"
    if not dry_run:
        manifest_path.write_text(json.dumps(sample_manifest, indent=2))

    summary = {}
    for s in sample_manifest:
        crop = s["crop"]
        if crop not in summary:
            summary[crop] = {"total": 0, "diseases": {}}
        summary[crop]["total"] += 1
        d = s["disease"]
        summary[crop]["diseases"][d] = summary[crop]["diseases"].get(d, 0) + 1

    print(f"\nBenchmark sample manifest: {len(sample_manifest)} images across {len(summary)} crops")
    for crop, stats in summary.items():
        print(f"  {crop}: {stats['total']} images ({', '.join(f'{k}: {v}' for k, v in stats['diseases'].items())})")

    return {"manifest": sample_manifest, "summary": summary}


def download_dataset(
    output_dir: str = "data/plantdisease",
    skip_if_exists: bool = True,
) -> bool:
    dataset_path = Path(output_dir)
    if skip_if_exists and (dataset_path / "color").exists():
        print(f"Dataset already exists at {output_dir}. Skipping download.")
        return True

    print("PlantVillage dataset download instructions:")
    print("=" * 60)
    print(f"1. Download from: https://www.kaggle.com/datasets/emmarex/plantdisease")
    print(f"   OR: https://github.com/spMohanty/PlantVillage-Dataset")
    print(f"2. Extract to: {output_dir}")
    print(f"3. Expected structure:")
    print(f"   {output_dir}/")
    print(f"     color/  (or raw/color/)")
    print(f"       Tomato___healthy/")
    print(f"       Tomato___Early_blight/")
    print(f"       ...")
    print(f"\nFor GitHub Actions, add to secrets or use kaggle API:")
    print(f"  kaggle datasets download -d emmarex/plantdisease -p {output_dir}")
    print(f"  unzip {output_dir}/plantdisease.zip -d {output_dir}")
    print("=" * 60)
    return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    dataset_dir = "data/plantdisease"
    if not Path(dataset_dir).exists():
        download_dataset(dataset_dir)
    else:
        sample_dataset(dataset_dir, samples_per_class=15)
