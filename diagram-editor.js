/**
 * diagram preview editor widget
 */
H5PEditor.widgets.diagramPreview = H5PEditor.diagramPreview = (function ($) {
    function PreviewWidget(parent, field, params, setValue) {
        const self = this;

        this.parent = parent;
        this.field = field;
        this.params = params;
        this.setValue = setValue;

        this.$preview = $('<div>', {
            class: 'h5p-diagram-editor-preview',
        });

        this._intervalId = null;
        this._lastSerializedParams = null;
        this._rootParent = null;

        /**
         * Append to wrapper (called by H5P editor)
         */
        this.appendTo = function ($wrapper) {
            $wrapper.addClass('h5p-diagram-editor-preview-wrapper');
            $wrapper.append(self.$preview);

            // Find the library-level parent (root editor for this content type)
            const libraryParent = (H5PEditor.findLibraryAncestor && H5PEditor.findLibraryAncestor(self.parent)) || self.parent;

            self._rootParent = libraryParent;

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
         * Render runtime diagram instance into the preview container
         */
        this.renderPreview = function (libraryParent) {

            if (!self._checkPreview(libraryParent)) {
                return;
            }

            try {
                const rootParent = libraryParent || self.parent;
                const params = (rootParent && rootParent.params) || {};
                const instance = new H5P.Diagram(params, (rootParent && rootParent.contentId) || 'editor-diagram-preview');
                instance.attach(self.$preview); // attach expects a jQuery-wrapped container
            } catch (err) {
                if (window.console && window.console.error) {
                    console.error('diagram preview error:', err);
                }
            }
        };

        this._checkPreview = function (libraryParent) {
            const container = self.$preview[0];

            if (!container) {
                return false;
            }

            if (typeof H5P === 'undefined' || typeof H5P.Diagram !== 'function') {
                container.innerHTML = '<p class="h5p-diagram-editor-preview-error"><em>Preview not available (diagram library not loaded).</em></p>';
                return false;
            }

            container.innerHTML = '';

            const rootParent = libraryParent || self.parent;
            const params = (rootParent && rootParent.params) || {};
            const previewPlaceholder = '<p class="h5p-diagram-editor-preview-placeholder"><em>A preview of the diagram will be displayed here once data is available.</em></p>';

            if (params.diagramType == 'euler' && params.euler.length <= 1) {
                container.innerHTML = previewPlaceholder;
                return false;
            }

            if (params.diagramType == 'pyramid' && params.pyramid.length <= 1) {
                container.innerHTML = previewPlaceholder;
                return false;
            }

            return true;
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
            const root = self._rootParent || (H5PEditor.findLibraryAncestor && H5PEditor.findLibraryAncestor(self.parent)) || self.parent;

            if (!root || !root.params) {
                return true;
            }

            const params = root.params;
            const type = params.diagramType || 'euler';

            if (type === 'euler') {
                delete params.pyramid;
                delete params.pyramidSettings;
            } else if (type === 'pyramid') {
                delete params.euler;
                delete params.intersections;
            }

            return true;
        };
    }

    PreviewWidget.prototype = Object.create(H5PEditor.widgets.text.prototype);
    PreviewWidget.prototype.constructor = PreviewWidget;

    return PreviewWidget;
})(H5P.jQuery);

H5PEditor.widgets.eulerIntersections = H5PEditor.EulerIntersections = (function ($) {
    function Widget(parent, field, params, setValue) {
        const self = this;

        this.parent = parent;
        this.field = field;
        this.params = params || []; // list of intersections
        this.setValue = setValue;

        this.$container = $('<div>', {
            class: 'h5p-diagram-editor-intersections-widget',
        });

        this._root = null;
        this._intervalId = null;
        this._lastCirclesSignature = null;

        this.appendTo = function ($wrapper) {
            $wrapper.append(self.$container);

            // Cache the library-level parent (root editor for this content)
            self._root = H5PEditor.findLibraryAncestor(self.parent) || self.parent;

            // Initial render
            self.render();

            // Start polling for circle changes
            self._intervalId = window.setInterval(function () {
                self._checkCircleChanges();
            }, 500);
        };

        this._ensureCircleIds = function () {
            const root = self._root || H5PEditor.findLibraryAncestor(self.parent) || self.parent;

            if (!root || !root.params || !Array.isArray(root.params.euler)) {
                return;
            }

            root.params.euler.forEach((circle) => {
                if (!circle._id) {
                    circle._id = 'circle-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
                }
            });
        };

        /**
         * Get current list of Euler circles from root params
         */
        this._getCircles = function () {
            const root = self._root || H5PEditor.findLibraryAncestor(self.parent) || self.parent;
            const circles = (root.params && root.params.euler) || [];
            self._ensureCircleIds();
            return circles;
        };

        /**
         * Check if circle definitions (labels, etc.) changed.
         * If yes, re-render to update dropdown options.
         */
        this._checkCircleChanges = function () {
            const circles = self._getCircles();

            // Only need a lightweight signature; labels are enough
            const signature = JSON.stringify(
                circles.map((c) => ({
                    label: c.label || '',
                    size: Number(c.size) || 0,
                    color: c.color || '',
                }))
            );

            if (signature !== self._lastCirclesSignature) {
                self._lastCirclesSignature = signature;
                self.render(); // re-render dropdowns with new labels
            }
        };

        this.render = function () {
            self.$container.empty();

            // Ensure params is an array
            if (!Array.isArray(self.params)) {
                self.params = [];
            }

            // Description
            if (self.field.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: self.field.description,
                }).appendTo(self.$container);
            }

            // Render each intersection row
            self.params.forEach(function (intersection, index) {
                self.renderIntersectionRow(intersection, index);
            });

            // "Add intersection" button
            $('<button>', {
                type: 'button',
                class: 'h5peditor-button h5peditor-button-textual h5p-diagram-editor-add-intersection',
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
            const $row = $('<div>', { class: 'h5p-diagram-editor-intersection-row' }).appendTo(self.$container);

            const fields = self.field.fields;
            const circleSetsField = fields.find(f => f.name == 'sets') || {};

            if (circleSetsField.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: circleSetsField.description,
                }).appendTo($row);
            }

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

            // "Add circle" button (optional 3rd or 4th)
            if (sets.length < 4) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5peditor-button-textual h5p-diagram-editor-add-circle',
                    text: 'Add circle',
                })
                    .appendTo($row)
                    .on('click', function () {
                        intersection.sets.push({ circleIndex: 1 });
                        self.save();
                        self.render();
                    });
            }

            // Label input
            const labelField = $('<div>', { class: 'field field-name-label text' }).appendTo($row);
            const labelLabel = $('<label>', {
                class: 'h5peditor-label-wrapper',
                for: 'field-diagram-label-' + index,
            }).appendTo(labelField);

            $('<span>', {
                class: 'h5peditor-label',
                text: 'Label',
            }).appendTo(labelLabel);

            const labelSemantic = fields.find(f => f.name == 'label') || {};

            if (labelSemantic.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: labelSemantic.description,
                }).appendTo(labelField);
            }

            const $labelInput = $('<input>', {
                id: 'field-diagram-label-' + index,
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
            const sizeLabel = $('<label>', {
                class: 'h5peditor-label-wrapper',
                for: 'field-diagram-size-' + index,
            }).appendTo(sizeField);

            $('<span>', {
                class: 'h5peditor-label',
                text: 'Size',
            }).appendTo(sizeLabel);

            const sizeSemantic = fields.find(f => f.name == 'size') || {};

            if (sizeSemantic.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: sizeSemantic.description,
                }).appendTo(sizeField);
            }

            const $sizeInput = $('<input>', {
                id: 'field-diagram-size-' + index,
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
                class: 'h5peditor-button h5p-diagram-editor-remove-intersection',
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

            const field = $('<div>', { class: 'field h5p-diagram-editor-circle-field select' }).appendTo($row);
            const $select = $('<select>', {
                class: 'h5peditor-select h5p-diagram-editor-circle-select',
                id: 'field-diagram-select-' + intersectionIndex + '-' + setIndex,
            }).appendTo(field);

            // Build options from current circles
            const circles = self._getCircles();

            circles.forEach(function (circle, i) {
                const label = (circle.label || 'Circle ' + (i + 1)).trim();
                $('<option>', {
                    value: circle._id,
                    text: label || 'Circle ' + (i + 1),
                }).appendTo($select);
            });

            // Determine current value:
            let currentId = ref.circleId || null;

            if (!currentId && typeof ref.circleIndex === 'number' && circles[ref.circleIndex - 1]) {
                currentId = circles[ref.circleIndex - 1]._id;
            }

            if (!currentId && circles[0]) {
                currentId = circles[0]._id;
            }

            // Ensure we store circleId for future stability
            if (!ref.circleId && currentId) {
                ref.circleId = currentId;
            }

            if (currentId) {
                $select.val(currentId);
            }

            $select.on('change', function () {
                const id = this.value;
                ref.circleId = id;

                // Also keep a numeric index for backward compatibility
                const idx = circles.findIndex((c) => c._id === id);
                if (idx >= 0) {
                    ref.circleIndex = idx + 1;
                }

                self.save();
            });

            // Optional "remove circle" button (but keep at least 2)
            if (intersection.sets.length > 2) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5p-diagram-editor-remove-circle',
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
            if (self._intervalId) {
                window.clearInterval(self._intervalId);
                self._intervalId = null;
            }
            self.$container.remove();
        };
    }

    Widget.prototype = Object.create(H5PEditor.widgets.list.prototype);
    Widget.prototype.constructor = Widget;

    return Widget;
})(H5P.jQuery);
