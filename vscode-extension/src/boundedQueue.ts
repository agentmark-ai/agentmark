export function createBoundedQueue<T>(maxLength: number) {
  if (maxLength <= 0) {
      throw new Error("Max length must be greater than 0.");
  }

  const queue: T[] = [];

  return {
      add(item: T) {
          if (queue.length >= maxLength) {
              queue.shift();
          }
          queue.push(item);
      },
      getItems() {
          return [...queue];
      }
  };
}