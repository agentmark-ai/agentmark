"""Score conversion and serialization utilities.

Ports the TypeScript `toStoredScore` and `serializeScoreRegistry` functions
to Python, providing canonical storage format for ClickHouse and JSON
transport serialization.
"""

from .types import EvalResult, ScoreRegistry, ScoreSchema


def to_stored_score(schema: ScoreSchema, result: EvalResult) -> dict:
    """Convert an EvalResult into canonical storage format using the schema.

    Args:
        schema: The score schema defining how to interpret the result.
        result: The evaluation result to convert.

    Returns:
        A dict with score, label, reason, and dataType fields suitable
        for ClickHouse storage.
    """
    schema_type = schema["type"]

    if schema_type == "boolean":
        passed = result.get("passed")
        if passed is None:
            score_val = result.get("score")
            passed = score_val >= 0.5 if score_val is not None else False
        return {
            "score": 1 if passed else 0,
            "label": "PASS" if passed else "FAIL",
            "reason": result.get("reason", ""),
            "dataType": "boolean",
        }
    elif schema_type == "numeric":
        score = result.get("score", 0)
        min_val = schema.get("min")
        max_val = schema.get("max")
        if min_val is not None and score < min_val:
            score = min_val
        if max_val is not None and score > max_val:
            score = max_val
        return {
            "score": score,
            "label": str(score),
            "reason": result.get("reason", ""),
            "dataType": "numeric",
        }
    elif schema_type == "categorical":
        label = result.get("label", "")
        categories = schema.get("categories", [])
        match = next((c for c in categories if c["label"] == label), None)
        return {
            "score": match["value"] if match else 0,
            "label": label,
            "reason": result.get("reason", ""),
            "dataType": "categorical",
        }
    else:
        return {
            "score": result.get("score", 0),
            "label": result.get("label", ""),
            "reason": result.get("reason", ""),
            "dataType": "",
        }


def serialize_score_registry(registry: ScoreRegistry) -> list:
    """Serialize a ScoreRegistry for JSON transport (strips eval functions).

    Args:
        registry: The score registry to serialize.

    Returns:
        A list of dicts with name, schema, hasEval, and optional description.
    """
    configs = []
    for name, defn in registry.items():
        config: dict = {
            "name": name,
            "schema": defn["schema"],
            "hasEval": callable(defn.get("eval")),
        }
        if "description" in defn and defn["description"]:
            config["description"] = defn["description"]
        configs.append(config)
    return configs
