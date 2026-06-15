"""
Unit tests para FaceEngine — lógica pura de numpy, sin DeepFace ni BD.
"""
import numpy as np
import pytest
from app.services.face_engine import FaceEngine

engine = FaceEngine()

# ── helpers ──────────────────────────────────────────────────────────────────

def _unit_vec(dim: int = 512, seed: int = 0) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.random(dim).astype(float)
    return (v / np.linalg.norm(v)).tolist()


# ── compare_embeddings ────────────────────────────────────────────────────────

def test_identical_embeddings_are_verified():
    vec = _unit_vec()
    verified, distance, confidence = engine.compare_embeddings(vec, vec)
    assert verified is True
    assert distance < 0.01
    assert confidence > 0.99


def test_opposite_embeddings_are_rejected():
    vec = _unit_vec()
    neg = [-x for x in vec]
    verified, distance, confidence = engine.compare_embeddings(vec, neg)
    assert verified is False
    assert distance > 1.0
    assert confidence == 0.0


def test_distance_is_symmetric():
    a = _unit_vec(seed=1)
    b = _unit_vec(seed=2)
    _, d_ab, _ = engine.compare_embeddings(a, b)
    _, d_ba, _ = engine.compare_embeddings(b, a)
    assert abs(d_ab - d_ba) < 1e-9


def test_confidence_zero_at_threshold():
    """Cuando distance == threshold, confidence debe ser exactamente 0."""
    threshold = 0.68
    vec_a = _unit_vec(seed=10)
    # Construimos vec_b tal que cosine_distance ≈ threshold
    vec_a_np = np.array(vec_a)
    perp = np.zeros(512)
    perp[0] = 1.0
    perp = perp - np.dot(perp, vec_a_np) * vec_a_np
    perp /= np.linalg.norm(perp)

    # cos(α) = 1 - threshold → α = arccos(1 - threshold)
    import math
    alpha = math.acos(1 - threshold)
    vec_b_np = math.cos(alpha) * vec_a_np + math.sin(alpha) * perp
    vec_b = vec_b_np.tolist()

    _, distance, confidence = engine.compare_embeddings(vec_a, vec_b)
    assert abs(distance - threshold) < 0.001
    assert confidence < 0.02


def test_output_values_are_rounded():
    a, b = _unit_vec(seed=3), _unit_vec(seed=4)
    _, distance, confidence = engine.compare_embeddings(a, b)
    assert distance == round(distance, 6)
    assert confidence == round(confidence, 4)
