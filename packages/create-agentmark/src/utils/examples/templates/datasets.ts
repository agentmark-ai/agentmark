export const getAnimalDataset = (): string => {
  return `{"input": {"animal": "cat"}, "expected_output": "A realistic picture of a cat"}
{"input": {"animal": "dog"}, "expected_output": "A realistic picture of a dog"}
{"input": {"animal": "bird"}, "expected_output": "A realistic picture of a bird"}`;
};

export const getCustomerQueryDataset = (): string => {
  return `{"input": {"customer_question": "My package hasn't arrived yet. Can you help me track it?"}}
{"input": {"customer_question": "I received the wrong item in my order. What should I do?"}}
{"input": {"customer_question": "How do I return a product that I purchased last week?"}}`;
};

export const getPartyDataset = (): string => {
  return `{"input": {"party_text": "We're having a party with Alice, Bob, and Carol."}, "expected_output": "{\\"names\\": [\\"Alice\\", \\"Bob\\", \\"Carol\\"]}"}
{"input": {"party_text": "The guest list includes Dave, Emma, and Frank."}, "expected_output": "{\\"names\\": [\\"Dave\\", \\"Emma\\", \\"Frank\\"]}"}
{"input": {"party_text": "Join us for a celebration with Grace, Henry, and Isla."}, "expected_output": "{\\"names\\": [\\"Grace\\", \\"Henry\\", \\"Isla\\"]}"}`;
};

export const getStoryDataset = (): string => {
  return `{"input": {"story": "Once upon a time, the Moon woke up and found her glow missing! She floated around the sky asking stars, clouds, and even comets if they'd seen her light. It wasn't until she peeked into a mountain lake that she saw her glow shining back—hidden in her own reflection! Laughing, she realized she had never lost it—it was with her all along, just hiding beneath a cloudy sky."}}
{"input": {"story": "Benny was no ordinary banana—he dreamed of becoming a superhero. One day, when a monkey slipped in the jungle and cried for help, Benny rolled into action, dodging vines and swinging from branches using his peel like a lasso. The monkey was saved, and from that day on, Benny was known as \\"The Peel of Justice,\\" the bravest fruit in the whole rainforest."}}
{"input": {"story": "In the town of Maplebrook, there was a library that whispered stories when no one was looking. Curious little Nia tiptoed in one rainy day and heard the books giggling softly. She opened one called The Secret Tunnel, and to her surprise, it sucked her in! She found herself riding a dragon through glittering caves. When she returned, the book winked shut—waiting for its next reader to listen."}}`;
};