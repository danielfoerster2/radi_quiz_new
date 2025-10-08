import base64
from typing import Dict, List, Union

from openai import OpenAI


client = OpenAI()


def _call_openai(system_prompt: str, user_content: List[Dict[str, str]]) -> str:
    response = client.responses.create(
        model="gpt-5",
        reasoning={"effort": "low"},
        input=[
            {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
            {"role": "user", "content": user_content},
        ],
    )
    if hasattr(response, "output_text"):
        return response.output_text
    if hasattr(response, "output"):
        fragments: List[str] = []
        for message in response.output:
            for block in message.get("content", []):
                if block.get("type") == "output_text":
                    fragments.append(block.get("text", ""))
        if fragments:
            return "".join(fragments)
    raise RuntimeError("OpenAI response did not include text output.")


def generate_questions(
    *,
    topic: str,
    language: str,
    difficulty: str,
    question_type: str,
    quantity: int,
    supplemental_context: str,
) -> str:
    context_block = ""
    if supplemental_context.strip():
        context_block = f"\nContext material:\n{supplemental_context.strip()}"
    prompt = (
        "Create exam questions for Auto Multiple Choice.\n"
        f"Language: {language}\n"
        f"Topic: {topic}\n"
        f"Difficulty: {difficulty}\n"
        f"Question type: {question_type}\n"
        f"Quantity: {quantity}\n"
        "Difficulty definitions: easy = direct recall or single-step routine; average = short application or"
        " synthesis task; hard = multi-step reasoning or subtle edge cases."
        "\nQuestion type definitions: simple = multiple-choice question with exactly one correct answer;"
        " multiple-choice = question where zero, one, or multiple answer options may be correct;"
        " open = question expecting a written response accompanied by one model answer"
        " stored in the answers list with is_correct set to true."
        " You may express any formulas using LaTeX code."
        "Return JSON with this shape:\n"
        '{ "questions": [ { "question_text": str, "question_type": str,'
        ' "answers": [ { "text": str, "is_correct": bool } ] } ] }\n'
        "Align rigor with the stated difficulty without declaring it in the text. Avoid markdown formatting."
        f"{context_block}"
    )
    return _call_openai(
        system_prompt="You design reliable AMC questions and answer keys.",
        user_content=[{"type": "text", "text": prompt}],
    )


def review_subject(*, latex_source: str, language: str) -> Dict[str, str]:
    prompts = {
        "grammar": (
            "Review spelling, grammar, and clarity issues in this LaTeX exam."
            " Return JSON {\"issues\": [{\"question_reference\": str, \"issue\": str, \"suggested_fix\": str}]}."
        ),
        "facts": (
            "Check factual accuracy in this LaTeX exam."
            " Return JSON {\"issues\": [{\"question_reference\": str, \"issue\": str, \"suggested_fix\": str}]}."
        ),
        "latex": (
            "Inspect LaTeX syntax and AMC usage. Flag errors that block compilation."
            " Return JSON {\"issues\": [{\"question_reference\": str, \"issue\": str, \"suggested_fix\": str}]}."
        ),
    }
    results: Dict[str, str] = {}
    for key, instruction in prompts.items():
        prompt = (
            f"Language for feedback: {language}\n"
            f"{instruction}\n"
            f"LaTeX source:\n{latex_source}"
        )
        results[key] = _call_openai(
            system_prompt="You audit Auto Multiple Choice LaTeX documents.",
            user_content=[{"type": "text", "text": prompt}],
        )
    return results


def extract_student_name(image: Union[str, bytes], *, language: str) -> str:
    if isinstance(image, str):
        with open(image, "rb") as handle:
            image_bytes = handle.read()
    else:
        image_bytes = image

    encoded = base64.b64encode(image_bytes).decode("ascii")
    prompt = (
        "Read the student's handwritten first and last name."
        f" Respond in {language} using JSON {{\"prenom\": str, \"nom\": str}}."
        " Always provide your best guess and spell names as clearly as possible, even when unsure."
    )
    return _call_openai(
        system_prompt="You transcribe handwritten student names from scans.",
        user_content=[
            {"type": "text", "text": prompt},
            {"type": "input_image", "image": encoded},
        ],
    )


__all__ = [
    "generate_questions",
    "review_subject",
    "extract_student_name",
]
