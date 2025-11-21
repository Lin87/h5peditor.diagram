/**
 * H5P.Diagram — Editor widgets
 *
 * This file contains editor-side widgets for the Diagram content type:
 *  - diagramPreview: shows a live preview of the current diagram configuration
 *  - eulerIntersections: provides a custom UI for managing Euler intersections
 *
 * These widgets run only inside the H5P editor and never in the learner view.
 */

/**
 * Shared editor utilities for Diagram.
 *
 * Provides helpers for:
 *  - Finding the root library parent in the editor tree
 *  - Starting / stopping simple polling timers
 */
(function ($) {
    H5PEditor.DiagramEditorUtils = H5PEditor.DiagramEditorUtils || {
        /**
         * Find the top-level library parent for a given editor widget.
         *
         * @param {object} parent
         * @returns {object}
         */
        getRootParent(parent) {
            if (H5PEditor.findLibraryAncestor) {
                return H5PEditor.findLibraryAncestor(parent) || parent;
            }

            return parent;
        },

        /**
         * Start a polling timer and store the interval ID on the given context.
         *
         * @param {object} context The widget instance
         * @param {string} propertyName Where to store the interval ID on the context
         * @param {Function} callback Function to run at each interval
         * @param {number} [intervalMs=500] Interval in milliseconds
         */
        startPolling(context, propertyName, callback, intervalMs) {
            const interval = typeof intervalMs === 'number' ? intervalMs : 500;

            // Clear any existing interval for safety
            if (context[propertyName]) {
                window.clearInterval(context[propertyName]);
            }

            context[propertyName] = window.setInterval(callback, interval);
        },

        /**
         * Stop a polling timer previously started with startPolling.
         *
         * @param {object} context
         * @param {string} propertyName
         */
        stopPolling(context, propertyName) {
            if (context[propertyName]) {
                window.clearInterval(context[propertyName]);
                context[propertyName] = null;
            }
        },
    };
})(H5P.jQuery);

/**
 * Diagram preview editor widget.
 *
 * Renders a live Diagram instance based on the current editor state.
 * The preview updates automatically when parameters change.
 */
H5PEditor.widgets.diagramPreview = H5PEditor.diagramPreview = (function ($) {
    /**
     * Preview widget constructor.
     *
     * @param {H5PEditor} parent
     * @param {object} field
     * @param {object} params
     * @param {Function} setValue
     * @constructor
     */
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
         * Append the preview container to the editor wrapper.
         *
         * Called by H5P when rendering the editor field.
         *
         * @param {H5P.jQuery} $wrapper
         */
        this.appendTo = function ($wrapper) {
            $wrapper.addClass('h5p-diagram-editor-preview-wrapper');
            $wrapper.append(self.$preview);

            // Find and cache the library-level parent (root editor for this content type)
            self._rootParent = H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

            // Initial render
            self.renderPreview(self._rootParent);

            // Poll for changes in params and re-render when they change
            H5PEditor.DiagramEditorUtils.startPolling(
                self,
                '_intervalId',
                function () {
                    self._checkForChanges(self._rootParent);
                },
                500
            );
        };

        /**
         * Check if the root params changed; if so, re-render the preview.
         *
         * @param {object} libraryParent
         * @private
         */
        this._checkForChanges = function (libraryParent) {
            const rootParent = libraryParent || self._rootParent || H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

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
         * Render a runtime Diagram instance into the preview container.
         *
         * @param {object} libraryParent
         */
        this.renderPreview = function (libraryParent) {
            if (!self._checkPreview(libraryParent)) {
                return;
            }

            try {
                const rootParent = libraryParent || self._rootParent || self.parent;
                const params = (rootParent && rootParent.params) || {};
                const contentId = (rootParent && rootParent.contentId) || 'editor-diagram-preview';

                const instance = new H5P.Diagram(params, contentId);
                // attach expects a jQuery-wrapped container
                instance.attach(self.$preview);
            } catch (err) {
                if (window.console && window.console.error) {
                    console.error('Diagram preview error:', err);
                }
            }
        };

        /**
         * Check if preview can be shown and container is ready.
         *
         * Shows an inline message when preview is not yet available.
         *
         * @param {object} libraryParent
         * @returns {boolean}
         * @private
         */
        this._checkPreview = function (libraryParent) {
            const container = self.$preview[0];

            if (!container) {
                return false;
            }

            if (typeof H5P === 'undefined' || typeof H5P.Diagram !== 'function') {
                container.innerHTML = '<p class="h5p-diagram-editor-preview-error">' + '<em>Preview not available (diagram library not loaded).</em>' + '</p>';
                return false;
            }

            container.innerHTML = '';

            const rootParent = libraryParent || self._rootParent || self.parent;
            const params = (rootParent && rootParent.params) || {};
            const previewPlaceholder = '<p class="h5p-diagram-editor-preview-placeholder">' + '<em>A preview of the diagram will be displayed here once data is available.</em>' + '</p>';

            if (params.diagramType === 'euler' && (!params.euler || params.euler.length <= 1)) {
                container.innerHTML = previewPlaceholder;
                return false;
            }

            if (params.diagramType === 'pyramid' && (!params.pyramid || params.pyramid.length <= 1)) {
                container.innerHTML = previewPlaceholder;
                return false;
            }

            return true;
        };

        /**
         * Clean up when the widget is removed from the editor.
         *
         * Stops polling and removes the preview container.
         */
        this.remove = function () {
            H5PEditor.DiagramEditorUtils.stopPolling(self, '_intervalId');

            if (self.$preview) {
                self.$preview.remove();
            }
        };

        /**
         * Validate and normalize params before saving.
         *
         * Keeps only the settings relevant for the selected diagram type.
         *
         * @returns {boolean}
         */
        this.validate = function () {
            const root = self._rootParent || H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

            if (!root || !root.params) {
                return true;
            }

            const params = root.params;
            const type = params.diagramType || 'euler';

            // Remove editor-only helper properties from circles
            if (Array.isArray(params.euler)) {
                params.euler.forEach((circle) => {
                    if (circle && typeof circle === 'object') {
                        delete circle._id;
                    }
                });
            }

            // Remove editor-only helper properties from intersections
            // Handle both flat array and nested { intersections: [] } just in case
            let intersectionList = null;

            if (Array.isArray(params.intersections)) {
                intersectionList = params.intersections;
            } else if (params.intersections && Array.isArray(params.intersections.intersections)) {
                intersectionList = params.intersections.intersections;
            }

            if (intersectionList) {
                intersectionList.forEach((intersection) => {
                    if (!intersection || !Array.isArray(intersection.sets)) {
                        return;
                    }

                    intersection.sets.forEach((ref) => {
                        if (ref && typeof ref === 'object') {
                            delete ref.circleId;
                        }
                    });
                });
            }
            // Clear unused config to avoid storing stale settings
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

/**
 * Custom editor widget for Euler intersections.
 *
 * Provides a more user-friendly way to select which circles
 * belong to each intersection and manage intersection size/labels.
 */
H5PEditor.widgets.eulerIntersections = H5PEditor.EulerIntersections = (function ($) {
    /**
     * Euler intersections widget constructor.
     *
     * @param {H5PEditor} parent
     * @param {object} field
     * @param {Array} params
     * @param {Function} setValue
     * @constructor
     */
    function Widget(parent, field, params, setValue) {
        const self = this;

        this.parent = parent;
        this.field = field;
        this.params = params || []; // List of intersections
        this.setValue = setValue;

        this.$container = $('<div>', {
            class: 'h5p-diagram-editor-intersections-widget',
        });

        this._root = null;
        this._intervalId = null;
        this._lastCirclesSignature = null;

        /**
         * Append the widget UI to the editor wrapper.
         *
         * @param {H5P.jQuery} $wrapper
         */
        this.appendTo = function ($wrapper) {
            $wrapper.append(self.$container);

            // Cache the library-level parent (root editor for this content)
            self._root = H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

            // Initial render
            self.render();

            // Start polling for circle changes so we can update dropdown options
            H5PEditor.DiagramEditorUtils.startPolling(
                self,
                '_intervalId',
                function () {
                    self._checkCircleChanges();
                },
                500
            );
        };

        /**
         * Ensure each circle has a stable internal ID, used by the selects.
         *
         * @private
         */
        this._ensureCircleIds = function () {
            const root = self._root || H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

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
         * Get current list of Euler circles from root params.
         *
         * @returns {Array}
         * @private
         */
        this._getCircles = function () {
            const root = self._root || H5PEditor.DiagramEditorUtils.getRootParent(self.parent);

            const circles = (root.params && root.params.euler) || [];
            self._ensureCircleIds();
            return circles;
        };

        /**
         * Check if circle definitions changed.
         * If yes, re-render so dropdown labels stay in sync.
         *
         * @private
         */
        this._checkCircleChanges = function () {
            const circles = self._getCircles();

            // Only need a lightweight signature; labels / size / color are enough
            const signature = JSON.stringify(
                circles.map((circle) => ({
                    label: circle.label || '',
                    size: Number(circle.size) || 0,
                    color: circle.color || '',
                }))
            );

            if (signature !== self._lastCirclesSignature) {
                self._lastCirclesSignature = signature;
                self.render();
            }
        };

        /**
         * Render all intersections and UI controls.
         */
        this.render = function () {
            self.$container.empty();

            // Ensure params is an array
            if (!Array.isArray(self.params)) {
                self.params = [];
            }

            // Description text from semantics
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

        /**
         * Render a single intersection row including circles, label, and size.
         *
         * @param {object} intersection
         * @param {number} index
         */
        this.renderIntersectionRow = function (intersection, index) {
            const $row = $('<div>', {
                class: 'h5p-diagram-editor-intersection-row',
            }).appendTo(self.$container);

            const fields = self.field.fields;
            const circleSetsField = fields.find((field) => field.name === 'sets') || {};

            if (circleSetsField.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: circleSetsField.description,
                }).appendTo($row);
            }

            // Circles dropdowns (ensure at least 2 entries)
            const sets = Array.isArray(intersection.sets) ? intersection.sets : [];

            if (sets.length < 2) {
                sets.push({ circleIndex: 1 }, { circleIndex: 2 });
            }

            intersection.sets = sets;

            sets.forEach(function (ref, setIdx) {
                self.renderCircleSelect($row, intersection, index, setIdx);
            });

            // "Add circle" button (optional 3rd or 4th circle)
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
            const labelField = $('<div>', {
                class: 'field field-name-label text',
            }).appendTo($row);

            const labelLabel = $('<label>', {
                class: 'h5peditor-label-wrapper',
                for: 'field-diagram-label-' + index,
            }).appendTo(labelField);

            $('<span>', {
                class: 'h5peditor-label',
                text: 'Label',
            }).appendTo(labelLabel);

            const labelSemantic = fields.find((field) => field.name === 'label') || {};

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
            const sizeField = $('<div>', {
                class: 'field field-name-size number',
            }).appendTo($row);

            const sizeLabel = $('<label>', {
                class: 'h5peditor-label-wrapper',
                for: 'field-diagram-size-' + index,
            }).appendTo(sizeField);

            $('<span>', {
                class: 'h5peditor-label',
                text: 'Size',
            }).appendTo(sizeLabel);

            const sizeSemantic = fields.find((field) => field.name === 'size') || {};

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

            // Remove intersection button
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

        /**
         * Render a single circle dropdown for an intersection.
         *
         * @param {H5P.jQuery} $row
         * @param {object} intersection
         * @param {number} intersectionIndex
         * @param {number} setIndex
         */
        this.renderCircleSelect = function ($row, intersection, intersectionIndex, setIndex) {
            const ref = intersection.sets[setIndex];

            const field = $('<div>', {
                class: 'field h5p-diagram-editor-circle-field select',
            }).appendTo($row);

            const $select = $('<select>', {
                class: 'h5peditor-select h5p-diagram-editor-circle-select',
                id: 'field-diagram-select-' + intersectionIndex + '-' + setIndex,
            }).appendTo(field);

            // Build options from current circles
            const circles = self._getCircles();

            circles.forEach(function (circle, index) {
                const label = (circle.label || 'Circle ' + (index + 1)).trim();

                $('<option>', {
                    value: circle._id,
                    text: label || 'Circle ' + (index + 1),
                }).appendTo($select);
            });

            // Determine current value
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
                const idx = circles.findIndex((circle) => circle._id === id);
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

        /**
         * Persist the current intersection configuration to the parent.
         */
        this.save = function () {
            self.setValue(self.field, self.params);
        };

        /**
         * Validation hook required by the H5P editor widget interface.
         *
         * Cleans editor-only helper properties from intersection data.
         *
         * @returns {boolean}
         */
        this.validate = function () {
            if (Array.isArray(self.params)) {
                self.params.forEach((intersection) => {
                    if (!intersection || !Array.isArray(intersection.sets)) {
                        return;
                    }

                    intersection.sets.forEach((ref) => {
                        if (ref && typeof ref === 'object') {
                            delete ref.circleId;
                        }
                    });
                });
            }

            return true;
        };

        /**
         * Clean up when the widget is removed from the editor.
         *
         * Stops polling and removes the DOM container.
         */
        this.remove = function () {
            H5PEditor.DiagramEditorUtils.stopPolling(self, '_intervalId');
            self.$container.remove();
        };
    }

    Widget.prototype = Object.create(H5PEditor.widgets.list.prototype);
    Widget.prototype.constructor = Widget;

    return Widget;
})(H5P.jQuery);
