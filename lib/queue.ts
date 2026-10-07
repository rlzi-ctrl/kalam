/**
 * Runs tasks one at a time, in the order they were added. Used in the browser to keep Azure Speech
 * (F0: one concurrent request) from getting parallel calls. A failed task doesn't stop the queue.
 */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => {});
    return result;
  };
}
