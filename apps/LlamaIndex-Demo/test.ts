type Example = {
  kind: "text";
  input: {
    userType: string;
    num: number;
  };
  output: {};
};

export default interface AgentmarkTypes {
  "example.prompt.mdx": Example;
}
