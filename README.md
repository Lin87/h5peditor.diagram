# H5PEditor.Diagram

Editor widgets used by the **H5P Diagram** content type.

This library contains the editor-side interface that helps authors configure Euler and Pyramid diagrams inside the H5P authoring tool. It does not run during learner playback; it exists only to improve authoring workflow and provide real-time feedback.

## Features

### Live Preview

A built-in preview automatically renders the diagram as authors update labels, colors, steps, and intersections.  
The preview updates every few hundred milliseconds to reflect changes immediately.

### Euler Intersections Editor

The custom intersections widget makes it easier to define which circles overlap and how large each intersection should be. It includes:

- Circle selection dropdowns  
- Dynamic updates when circles change  
- Optional labels and size values  
- Add/remove buttons with validation  

### Shared Utilities

The editor library includes a small utility module that:

- Locates the root content parent in the editor tree  
- Handles polling and cleanup  
- Supports stable IDs for Euler circles  

These utilities help keep the editor widgets cleaner and more consistent.

## Relationship to the Main Library

`H5PEditor.Diagram` is the editor companion to:

**H5P.Diagram**  
(Used during learner playback)

While the main library draws diagrams, the editor library provides the UI controls needed to configure them.

## License

MIT License

Copyright (c) 2025 Ethan Lin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
