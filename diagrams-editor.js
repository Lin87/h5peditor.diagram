/**
 * Diagrams preview editor widget
 */
H5PEditor.widgets.diagramsPreview = H5PEditor.DiagramsPreview = (function ($) {
    function PreviewWidget(parent, field, params, setValue) {
        const self = this;

        this.parent = parent;
        this.field = field;
        this.params = params;
        this.setValue = setValue;

        this.$preview = $('<div>', {
            class: 'h5p-diagrams-editor-preview',
        });

        this._intervalId = null;
        this._lastSerializedParams = null;

        /**
         * Append to wrapper (called by H5P editor)
         */
        this.appendTo = function ($wrapper) {
            $wrapper.addClass('h5p-diagrams-editor-preview-wrapper');
            $wrapper.append(self.$preview);

            // Find the library-level parent (root editor for this content type)
            const libraryParent = (H5PEditor.findLibraryAncestor && H5PEditor.findLibraryAncestor(self.parent)) || self.parent;

            // Initial render
            self.renderPreview(libraryParent);

            // Poll for changes in params and re-render when they change
            self._intervalId = window.setInterval(function () {
                self._checkForChanges(libraryParent);
            }, 500);
        };

        /**
         * Check if params changed; if so, re-render preview
         */
        this._checkForChanges = function (libraryParent) {
            const rootParent = libraryParent || self.parent;

            if (!rootParent) {
                return;
            }

            const params = rootParent.params || {};
            const serialized = JSON.stringify(params);

            if (serialized !== self._lastSerializedParams) {
                self._lastSerializedParams = serialized;
                self.renderPreview(rootParent);
            }
        };

        /**
         * Render runtime Diagrams instance into the preview container
         */
        this.renderPreview = function (libraryParent) {
            const container = self.$preview[0];
            if (!container) {
                return;
            }

            if (typeof H5P === 'undefined' || typeof H5P.Diagrams !== 'function') {
                container.innerHTML = '<em>Preview not available (Diagrams library not loaded).</em>';
                return;
            }

            container.innerHTML = '';

            const rootParent = libraryParent || self.parent;
            const params = (rootParent && rootParent.params) || {};

            try {
                const instance = new H5P.Diagrams(params, (rootParent && rootParent.contentId) || 'editor-diagrams-preview');

                // attach expects a jQuery-wrapped container
                instance.attach(self.$preview);
            } catch (err) {
                if (window.console && window.console.error) {
                    console.error('Diagrams preview error:', err);
                }
            }
        };

        /**
         * Clean up
         */
        this.remove = function () {
            if (self._intervalId) {
                window.clearInterval(self._intervalId);
                self._intervalId = null;
            }
            if (self.$preview) {
                self.$preview.remove();
            }
        };

        this.validate = function () {
            return true;
        };
    }

    PreviewWidget.prototype = Object.create(H5PEditor.widgets.text.prototype);
    PreviewWidget.prototype.constructor = PreviewWidget;

    return PreviewWidget;
})(H5P.jQuery);

H5PEditor.widgets.vennIntersections = H5PEditor.VennIntersections = (function ($) {
    function Widget(parent, field, params, setValue) {
        const self = this;

        this.parent = parent;
        this.field = field;
        this.params = params || []; // list of intersections
        this.setValue = setValue;

        this.$container = $('<div>', {
            class: 'h5p-diagrams-intersections-widget',
        });

        this.appendTo = function ($wrapper) {
            $wrapper.append(self.$container);
            self.render();
        };

        this.render = function () {
            self.$container.empty();

            // Ensure params is an array
            if (!Array.isArray(self.params)) {
                self.params = [];
            }

            // Render each intersection row
            self.params.forEach(function (intersection, index) {
                self.renderIntersectionRow(intersection, index);
            });

            // "Add intersection" button
            $('<button>', {
                type: 'button',
                class: 'h5peditor-button h5peditor-button-textual h5p-diagrams-add-intersection',
                text: 'Add intersection',
            })
                .appendTo(self.$container)
                .on('click', function () {
                    self.params.push({ sets: [], size: 0 });
                    self.save();
                    self.render();
                });
        };

        this.renderIntersectionRow = function (intersection, index) {
            const $row = $('<div>', { class: 'h5p-diagrams-intersection-row' }).appendTo(self.$container);

            // Circles dropdowns (min 2)
            const sets = Array.isArray(intersection.sets) ? intersection.sets : [];
            if (sets.length < 2) {
                // ensure at least 2 entries
                sets.push({ circleIndex: 1 }, { circleIndex: 2 });
            }
            intersection.sets = sets;

            sets.forEach(function (ref, setIdx) {
                self.renderCircleSelect($row, intersection, index, setIdx);
            });

            // "Add circle" button (optional 3rd/4th)
            if (sets.length < 3) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5peditor-button-textual h5p-diagrams-add-circle',
                    text: 'Add circle',
                })
                    .appendTo($row)
                    .on('click', function () {
                        intersection.sets.push({ circleIndex: 1 });
                        self.save();
                        self.render();
                    });
            }

            // label input
            const labelField = $('<div>', { class: 'field field-name-label text' }).appendTo($row);
            const labelLabel = $('<label>', { class: 'h5peditor-label-wrapper', for: 'field-diagrams-label-' + index }).appendTo(labelField);

            $('<span>', { class: 'h5peditor-label h5peditor-required', text: 'Label' }).appendTo(labelLabel);

            const $labelInput = $('<input>', {
                id: 'field-diagrams-label-' + index,
                class: 'h5peditor-text',
                type: 'text',
                value: intersection.label || '',
            }).appendTo(labelField);

            $labelInput.on('change', function () {
                intersection.label = this.value.trim();
                self.save();
            });

            // Size input
            const sizeField = $('<div>', { class: 'field field-name-size number' }).appendTo($row);
            const sizeLabel = $('<label>', { class: 'h5peditor-label-wrapper', for: 'field-diagrams-size-' + index }).appendTo(sizeField);

            $('<span>', { class: 'h5peditor-label h5peditor-required', text: 'Size' }).appendTo(sizeLabel);

            const $sizeInput = $('<input>', {
                id: 'field-diagrams-size-' + index,
                class: 'h5peditor-text',
                type: 'number',
                min: 0,
                max: 100,
                value: intersection.size || 0,
            }).appendTo(sizeField);

            $sizeInput.on('change', function () {
                let size = Number(this.value);

                if (size >= 100) {
                  size = 100;
                } else if (size <= 0) {
                  size = 0;
                }

                intersection.size = size || 0;
                self.save();
            });

            // Remove intersection
            $('<button>', {
                type: 'button',
                class: 'h5peditor-button h5p-diagrams-remove-intersection',
                'aria-label': 'Remove',
            })
                .appendTo($row)
                .on('click', function () {
                    self.params.splice(index, 1);
                    self.save();
                    self.render();
                });
        };

        this.renderCircleSelect = function ($row, intersection, intersectionIndex, setIndex) {
            const ref = intersection.sets[setIndex];

            const field = $('<div>', { class: 'field h5p-diagrams-circle-field select' }).appendTo($row);
            const $select = $('<select>', { class: 'h5peditor-select h5p-diagrams-circle-select', id: 'field-diagrams-select-' + intersectionIndex + '-' + setIndex }).appendTo(field);

            // Build options from current circles
            const root = H5PEditor.findLibraryAncestor(self.parent) || self.parent;
            const vennParams = (root.params && root.params.venn) || {};
            const circles = (vennParams || []).map((c) => c.circle || c);

            circles.forEach(function (circle, i) {
                const label = (circle.label || 'Circle ' + (i + 1)).trim();
                $('<option>', {
                    value: i + 1, // 1-based index
                    text: label || 'Circle ' + (i + 1),
                }).appendTo($select);
            });

            // Set current value
            const currentIndex = ref.circleIndex || 1;
            $select.val(String(currentIndex));

            $select.on('change', function () {
                ref.circleIndex = Number(this.value) || 1;
                self.save();
            });

            // Optional "remove circle" button (but keep at least 2)
            if (intersection.sets.length > 2) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5p-diagrams-remove-circle',
                    text: '×',
                })
                    .appendTo($row)
                    .on('click', function () {
                        intersection.sets.splice(setIndex, 1);
                        self.save();
                        self.render();
                    });
            }
        };

        this.save = function () {
            self.setValue(self.field, self.params);
        };

        this.validate = function () {
            return true;
        };

        this.remove = function () {
            self.$container.remove();
        };
    }

    Widget.prototype = Object.create(H5PEditor.widgets.list.prototype);
    Widget.prototype.constructor = Widget;

    return Widget;
})(H5P.jQuery);
