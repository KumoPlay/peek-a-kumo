import '@fontsource-variable/nunito';
import './ui/styles/main.css';
import { render } from 'preact';
import { spriteSheet } from './art';
import { unlockAudio } from './platform/audio';
import { startOfflineSupport } from './platform/pwa';
import { App } from './ui/App';

// Every object picture, defined once; scenes and the list draw copies of them.
document.body.insertAdjacentHTML('afterbegin', spriteSheet());

const root = document.getElementById('app');
if (root) render(<App />, root);

// The game does its own zooming inside scenes; stop the browser from zooming the whole page
// (iOS Safari ignores user-scalable=no).
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());

// Sounds can only start after a tap (browsers require it, and nothing should play before that anyway).
document.addEventListener('pointerdown', unlockAudio, { capture: true });

startOfflineSupport();
