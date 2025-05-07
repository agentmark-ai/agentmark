export const getResponseQualityEvalPrompt = (model: string): string => {
  return `---
name: response-quality-eval
object_config:
  model_name: ${model}
  settings:
    top_p: 1
    max_tokens: 4096
    schema:
      type: object
      properties:
        score:
          type: number
          description: "The score of the response"
        label:
          type: string
          description: "The label of the response"
        reason: 
          type: string
          description: "The reason for the score"
      required:
        - score
        - label
        - reason
test_settings:
  props:
    customer_message: "I'm having trouble with my order"
    model_output: "I'm sorry to hear that. Please let me know what the issue is and I'll be happy to help."
input_schema:
  type: object
  properties:
    customer_message:
      type: string
      description: "The customer's message"
    model_output:
      type: string
      description: "The model's output"
  required:
    - customer_message
    - model_output
---
<User>
      Rate the helpfulness and relevance of the suggested reply.
      Respond with a score (0-1) and a label from: helpful, somewhat helpful, unhelpful, irrelevant.
  
      Message: {props.customer_message}
      Suggested Reply: {props.model_output}
</User>
`;
}; 