/** A deep copy of plain data. Uses structuredClone where the browser has it. */
export function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
}
