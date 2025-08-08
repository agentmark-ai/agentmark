export const getPartyPlannerPrompt = (model: string): string => {
  return `---
name: party-planner
object_config:
  model_name: ${model}
  schema:
    type: object
    properties:
      names:
        type: array
        description: "List of names of people attending the party."
        items:
          type: string
    required:
      - names
test_settings:
  dataset: ./party.jsonl
  evals:
    - exact_match_json
  props:
    party_text: "We're having a party with Alice, Bob, and Carol."
input_schema:
  type: object
  properties:
    party_text:
      type: string
      description: "A block of text describing the upcoming party and attendees."
  required:
    - party_text
---

<System>
Extract the names of all people attending the party from the following text. Respond with a list of names only.
</System>

<User>
Text: {props.party_text}
</User>`;
};