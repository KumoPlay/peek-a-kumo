/**
 * Two tabs saving the same game would overwrite each other. When a newer tab
 * opens the game, older tabs are told, so they can step back.
 * Returns a function that stops watching.
 */
export function watchForNewerTab(onNewerTab: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel('peek-a-kumo');
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === 'opened') onNewerTab();
  };
  channel.postMessage('opened');
  return () => channel.close();
}
