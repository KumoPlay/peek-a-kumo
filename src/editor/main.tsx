import '@fontsource-variable/nunito';
import './editor.css';
import { render } from 'preact';
import { spriteSheet } from '../art';
import { Editor } from './Editor';

// The scene editor: a developer tool, opened with `npm run editor`. It is not part of the built game.
document.body.insertAdjacentHTML('afterbegin', spriteSheet());
const root = document.getElementById('editor');
if (root) render(<Editor />, root);
