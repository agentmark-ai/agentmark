// AgentMark type definitions for Mastra demo

export interface Tools {
  get_weather: { 
    args: { 
      location: string; 
      units: "celsius" | "fahrenheit" 
    } 
  };
}

interface ObjectEntry<I, O> { kind: 'object'; input: I; output: O }
interface TextEntry<I, O>   { kind: 'text';   input: I; output: O }
interface ImageEntry<I, O>  { kind: 'image';  input: I; output: O }
interface SpeechEntry<I, O> { kind: 'speech'; input: I; output: O }

// Text Chat Prompt Types
interface TextChatIn {
  userMessage: string;
}

interface TextChatOut {
  text: string;
  toolCalls?: any[];
}

// Extract Person Prompt Types
interface ExtractPersonIn {
  inputText: string;
}

interface ExtractPersonOut {
  name?: string;
  age?: number;
  occupation?: string;
  location?: string;
  skills?: string[];
  experience_years?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
}

// Generate Artwork Prompt Types
interface GenerateArtworkIn {
  description: string;
  style: string;
  mood: string;
}

interface GenerateArtworkOut {
  images: string[];
}

// Narrate Story Prompt Types
interface NarrateStoryIn {
  storyText: string;
}

interface NarrateStoryOut {
  audio: string;
}

type TextChat = TextEntry<TextChatIn, TextChatOut>;
type ExtractPerson = ObjectEntry<ExtractPersonIn, ExtractPersonOut>;
type GenerateArtwork = ImageEntry<GenerateArtworkIn, GenerateArtworkOut>;
type NarrateStory = SpeechEntry<NarrateStoryIn, NarrateStoryOut>;

interface AgentmarkTypes {
  "text-chat.prompt.mdx": TextChat,
  "extract-person.prompt.mdx": ExtractPerson,
  "generate-artwork.prompt.mdx": GenerateArtwork,
  "narrate-story.prompt.mdx": NarrateStory,
}

export default AgentmarkTypes;