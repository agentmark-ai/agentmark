export const getCustomerSupportPrompt = (model: string): string => {
  return `---
name: customer-reply
text_config:
  model_name: ${model}
test_settings:
  dataset: ./customer-query.jsonl
  props:
    customer_question: "I'm having trouble with my order"
input_schema:
  type: object
  properties:
    customer_question:
      type: string
      description: "The customer's question"
  required:
    - customer_question
---

<System>
You are a customer service agent for a company that sells products online. You are given a customer's reply and you need to respond to the customer's reply. You need to be friendly, professional, and helpful.
</System>

<User>{props.customer_question}</User>`;
};