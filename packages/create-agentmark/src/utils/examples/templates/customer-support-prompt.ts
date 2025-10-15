export const getCustomerSupportPrompt = (model: string): string => {
  return `---
name: customer-reply
text_config:
  model_name: ${model}
  max_calls: 2
  tools:
    search_knowledgebase:
      description: Search the company knowledgebase for information about shipping, warranty, and returns policies.
      parameters:
        type: object
        properties:
          query:
            type: string
            description: The search query to find relevant information
        required: [query]
test_settings:
  dataset: ./customer-query.jsonl
  props:
    customer_question: "I'm having trouble with my order. How long does shipping take?"
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
You are a customer service agent for a company that sells products online. You are given a customer's question and you need to respond to the customer. You need to be friendly, professional, and helpful.

You have access to the following tool:
- search_knowledgebase: Search the company knowledgebase for information about shipping, warranty, and returns. Use this when customers ask about these topics.
</System>

<User>{props.customer_question}</User>`;
};