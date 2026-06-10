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
    const DIAGRAM_EDITOR_LIBRARY = 'H5PEditor.Diagram';
    const ENGLISH_STRINGS = {
        previewNotAvailable: 'Preview not available (diagram library not loaded).',
        previewPlaceholder: 'A preview of the diagram will be displayed here once data is available.',
        addIntersection: 'Add intersection',
        addCircle: 'Add circle',
        remove: 'Remove',
        label: 'Label',
        size: 'Size',
        circleLabel: 'Circle :index',
        addPairwiseIntersections: 'Add pairwise intersections for: :pairs.',
        increasePairwiseSizes: 'Increase these pairwise sizes to at least :size: :pairs.',
        multiCircleIntersectionWarning: 'Multi-circle intersections need matching pairwise overlaps to render. :details',
    };

    /**
     * Replace H5P-style placeholders in a fallback string.
     *
     * @param {string} text
     * @param {object} [vars]
     * @returns {string}
     */
    function replacePlaceholders(text, vars) {
        let translatedText = text;

        Object.keys(vars || {}).forEach((placeholder) => {
            translatedText = translatedText.split(placeholder).join(vars[placeholder]);
        });

        return translatedText;
    }

    H5PEditor.DiagramEditorUtils = H5PEditor.DiagramEditorUtils || {
        /**
         * Translate a custom Diagram editor widget string.
         *
         * @param {string} key
         * @param {object} [vars]
         * @returns {string}
         */
        t(key, vars) {
            const fallback = ENGLISH_STRINGS[key] || key;

            if (typeof H5PEditor.t === 'function') {
                const translated = H5PEditor.t(DIAGRAM_EDITOR_LIBRARY, key, vars || {});

                if (
                    translated &&
                    translated.indexOf('Missing translations for library ') !== 0 &&
                    translated.indexOf('[Missing translation ') !== 0
                ) {
                    return translated;
                }
            }

            return replacePlaceholders(fallback, vars);
        },

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

        /**
         * Simple debounce utility for editor-side use.
         *
         * @param {Function} fn
         * @param {number} delay
         * @returns {Function}
         */
        debounce(fn, delay) {
            let timeout = null;

            function debounced(...args) {
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(() => fn.apply(this, args), delay);
            }

            debounced.cancel = function () {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
            };

            return debounced;
        },

        /**
         * Return only author-facing params used to render the diagram.
         *
         * @param {object} params
         * @returns {object}
         */
        getCacheRelevantParams(params) {
            const sourceParams = params || {};
            const relevantParams = {};

            Object.keys(sourceParams).forEach((key) => {
                if (key !== 'preview') {
                    relevantParams[key] = sourceParams[key];
                }
            });

            return relevantParams;
        },

        /**
         * Stringify values with stable object key ordering.
         *
         * @param {*} value
         * @returns {string}
         */
        stableStringify(value) {
            if (Array.isArray(value)) {
                return '[' + value.map((item) => H5PEditor.DiagramEditorUtils.stableStringify(item)).join(',') + ']';
            }

            if (value && typeof value === 'object') {
                return '{' + Object.keys(value)
                    .filter((key) => typeof value[key] !== 'undefined' && typeof value[key] !== 'function')
                    .sort()
                    .map((key) => JSON.stringify(key) + ':' + H5PEditor.DiagramEditorUtils.stableStringify(value[key]))
                    .join(',') + '}';
            }

            return JSON.stringify(typeof value === 'undefined' ? null : value);
        },

        /**
         * Build a compact deterministic signature for render-relevant params.
         *
         * @param {object} params
         * @returns {string}
         */
        getParamsHash(params) {
            const serializedParams = H5PEditor.DiagramEditorUtils.stableStringify(
                H5PEditor.DiagramEditorUtils.getCacheRelevantParams(params)
            );
            let hash = 2166136261;

            for (let i = 0; i < serializedParams.length; i++) {
                hash ^= serializedParams.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }

            return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
        },

        /**
         * Remove editor-only helper properties from a list of intersections.
         *
         * Currently clears `circleId` from each circle reference.
         *
         * @param {Array} intersections
         */
        cleanIntersectionCircleIds(intersections) {
            if (!Array.isArray(intersections)) {
                return;
            }

            intersections.forEach((intersection) => {
                if (!intersection || !Array.isArray(intersection.sets)) {
                    return;
                }

                intersection.sets.forEach((ref) => {
                    if (ref && typeof ref === 'object') {
                        delete ref.circleId;
                    }
                });
            });
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
         * Debounced wrapper around renderPreview to avoid excessive redraws.
         *
         * @private
         */
        this._debouncedRender = H5PEditor.DiagramEditorUtils.debounce(
            (rootParent) => self.renderPreview(rootParent),
            250 // milliseconds; feels responsive
        );

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
                self._debouncedRender(rootParent);
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

            const getPreviewMessageMarkup = function (className, message) {
                const messageElement = document.createElement('p');
                const emphasisElement = document.createElement('em');

                messageElement.className = className;
                emphasisElement.textContent = message;
                messageElement.appendChild(emphasisElement);

                return messageElement.outerHTML;
            };

            if (typeof H5P === 'undefined' || typeof H5P.Diagram !== 'function') {
                container.innerHTML = getPreviewMessageMarkup(
                    'h5p-diagram-editor-preview-error',
                    H5PEditor.DiagramEditorUtils.t('previewNotAvailable')
                );
                return false;
            }

            container.innerHTML = '';

            const rootParent = libraryParent || self._rootParent || self.parent;
            const params = (rootParent && rootParent.params) || {};
            const previewPlaceholder = getPreviewMessageMarkup(
                'h5p-diagram-editor-preview-placeholder',
                H5PEditor.DiagramEditorUtils.t('previewPlaceholder')
            );

            const eulerCircles = params.euler && Array.isArray(params.euler.circles)
                ? params.euler.circles
                : Array.isArray(params.euler)
                    ? params.euler
                    : [];

            const pyramidSteps = params.pyramid && Array.isArray(params.pyramid.steps)
                ? params.pyramid.steps
                : Array.isArray(params.pyramid)
                    ? params.pyramid
                    : [];

            if (params.diagramType === 'euler' && eulerCircles.length < 2) {
                container.innerHTML = previewPlaceholder;
                return false;
            }

            if (params.diagramType === 'pyramid' && pyramidSteps.length < 1) {
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

            // Cancel any pending debounced render
            if (self._debouncedRender && self._debouncedRender.cancel) {
                self._debouncedRender.cancel();
            }

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
            const eulerCircles = params.euler && Array.isArray(params.euler.circles)
                ? params.euler.circles
                : Array.isArray(params.euler)
                    ? params.euler
                    : [];

            eulerCircles.forEach((circle) => {
                if (circle && typeof circle === 'object') {
                    delete circle._id;
                }
            });

            // Remove editor-only helper properties from intersections
            // Handle both flat array and nested { intersections: [] } just in case
            let intersectionList = null;

            if (Array.isArray(params.intersections)) {
                intersectionList = params.intersections;
            } else if (params.intersections && Array.isArray(params.intersections.intersections)) {
                intersectionList = params.intersections.intersections;
            }

            H5PEditor.DiagramEditorUtils.cleanIntersectionCircleIds(intersectionList);

            // Clear unused config to avoid storing stale settings
            if (type === 'euler') {
                delete params.pyramid;
                delete params.pyramidSettings;
            } else if (type === 'pyramid') {
                delete params.euler;
                delete params.intersections;
            }

            if (self._debouncedRender && self._debouncedRender.cancel) {
                self._debouncedRender.cancel();
            }

            self.renderPreview(root);

            // Persist the current preview markup for stable learner playback.
            // Only real SVG output is cached; editor placeholders/errors are not.
            const previewContainer = self.$preview && self.$preview[0];

            if (previewContainer) {
                if (!params.preview || typeof params.preview !== 'object') {
                    params.preview = {};
                }

                const hasEditorOnlyMarkup = !!previewContainer.querySelector('.h5p-diagram-editor-preview-placeholder, .h5p-diagram-editor-preview-error');
                const hasDiagramSvg = !!previewContainer.querySelector('.h5p-diagram-figure svg');

                if (hasDiagramSvg && !hasEditorOnlyMarkup) {
                    params.preview.savedMarkup = previewContainer.innerHTML || '';
                    params.preview.savedDiagramType = type;
                    params.preview.savedParamsHash = H5PEditor.DiagramEditorUtils.getParamsHash(params);
                } else {
                    delete params.preview.savedMarkup;
                    delete params.preview.savedDiagramType;
                    delete params.preview.savedParamsHash;
                }
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
        this.t = H5PEditor.DiagramEditorUtils.t;

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
         * Get current list of Euler circles from root params.
         *
         * @returns {Array}
         * @private
         */
        this._getCircles = function () {
            const root = self._root || H5PEditor.DiagramEditorUtils.getRootParent(self.parent);
            const params = (root && root.params) || {};
            const euler = params.euler || {};

            if (Array.isArray(euler.circles)) {
                return euler.circles;
            }

            // Backward compatibility with older params shape, if any.
            if (Array.isArray(euler)) {
                return euler;
            }

            return [];
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
         * Normalize one intersection's circle refs.
         *
         * Ensures:
         * - refs use circleIndex only
         * - circleIndex is within available circles
         * - duplicate circleIndex values are removed
         * - at least 2 refs exist when possible
         *
         * @param {object} intersection
         * @returns {object}
         * @private
         */
        this._normalizeIntersectionSets = function (intersection) {
            const circles = self._getCircles();
            const circleCount = circles.length;

            if (!intersection || typeof intersection !== 'object') {
                intersection = {};
            }

            const rawSets = Array.isArray(intersection.sets) ? intersection.sets : [];
            const normalizedSets = [];
            const usedIndexes = {};

            rawSets.forEach(function (ref) {
                let circleIndex;

                // Support old/simple shape: sets: [1, 2]
                if (typeof ref === 'number' || typeof ref === 'string') {
                    circleIndex = Number(ref);
                }
                // Support new semantics shape: sets: [{ circleIndex: 1 }, { circleIndex: 2 }]
                else if (ref && typeof ref === 'object') {
                    circleIndex = Number(ref.circleIndex);
                } else {
                    return;
                }

                if (!Number.isFinite(circleIndex)) {
                    return;
                }

                circleIndex = Math.floor(circleIndex);

                if (circleCount > 0) {
                    circleIndex = Math.max(1, Math.min(circleIndex, circleCount));
                } else {
                    return;
                }

                if (usedIndexes[circleIndex]) {
                    return;
                }

                usedIndexes[circleIndex] = true;
                normalizedSets.push(circleIndex);
            });

            if (circleCount === 0) {
                intersection.sets = [];
                return intersection;
            }

            const targetLength = Math.min(2, circleCount);

            for (let i = 1; normalizedSets.length < targetLength; i++) {
                if (!usedIndexes[i]) {
                    usedIndexes[i] = true;
                    normalizedSets.push(i);
                }

                if (i > Math.max(circleCount, 2)) {
                    break;
                }
            }

            intersection.sets = normalizedSets;

            return intersection;
        };

        /**
         * Convert a stored circle reference to a 1-based circle index.
         *
         * @param {number|string|object} ref
         * @returns {number|null}
         * @private
         */
        this._getCircleIndex = function (ref) {
            const rawIndex = ref && typeof ref === 'object'
                ? Number(ref.circleIndex)
                : Number(ref);

            if (!Number.isFinite(rawIndex)) {
                return null;
            }

            return Math.floor(rawIndex);
        };

        /**
         * Get the selected 1-based circle indexes for an intersection.
         *
         * @param {object} intersection
         * @returns {number[]}
         * @private
         */
        this._getIntersectionCircleIndexes = function (intersection) {
            if (!intersection || !Array.isArray(intersection.sets)) {
                return [];
            }

            return intersection.sets
                .map((ref) => self._getCircleIndex(ref))
                .filter((circleIndex) => circleIndex !== null);
        };

        /**
         * Return a readable circle label for warning messages.
         *
         * @param {number} circleIndex 1-based circle index
         * @returns {string}
         * @private
         */
        this._getCircleLabel = function (circleIndex) {
            const circles = self._getCircles();
            const circle = circles[circleIndex - 1] || {};
            const label = (circle.label || '').trim();

            return label || self.t('circleLabel', { ':index': String(circleIndex) });
        };

        /**
         * Create a stable key for a pair of 1-based circle indexes.
         *
         * @param {number} firstIndex
         * @param {number} secondIndex
         * @returns {string}
         * @private
         */
        this._getPairKey = function (firstIndex, secondIndex) {
            return [firstIndex, secondIndex].sort((a, b) => a - b).join(':');
        };

        /**
         * Find missing or undersized pairwise overlaps for a multi-circle intersection.
         *
         * @param {object} intersection
         * @param {number} intersectionIndex
         * @returns {object|null}
         * @private
         */
        this._getIntersectionWarning = function (intersection, intersectionIndex) {
            const selectedIndexes = self._getIntersectionCircleIndexes(intersection);

            if (selectedIndexes.length <= 2) {
                return null;
            }

            const intersectionSize = Number(intersection.size) || 0;

            const pairSizes = {};

            self.params.forEach(function (candidate, candidateIndex) {
                if (candidateIndex === intersectionIndex) {
                    return;
                }

                const candidateIndexes = self._getIntersectionCircleIndexes(candidate);

                if (candidateIndexes.length !== 2) {
                    return;
                }

                const key = self._getPairKey(candidateIndexes[0], candidateIndexes[1]);
                const size = Number(candidate.size) || 0;
                pairSizes[key] = Math.max(pairSizes[key] || 0, size);
            });

            const missingPairs = [];
            const undersizedPairs = [];

            for (let first = 0; first < selectedIndexes.length; first++) {
                for (let second = first + 1; second < selectedIndexes.length; second++) {
                    const firstIndex = selectedIndexes[first];
                    const secondIndex = selectedIndexes[second];
                    const key = self._getPairKey(firstIndex, secondIndex);
                    const pairLabel = self._getCircleLabel(firstIndex) + ' + ' + self._getCircleLabel(secondIndex);
                    const pairSize = pairSizes[key] || 0;

                    if (pairSize <= 0) {
                        missingPairs.push(pairLabel);
                    } else if (intersectionSize > 0 && pairSize < intersectionSize) {
                        undersizedPairs.push(pairLabel);
                    }
                }
            }

            if (!missingPairs.length && !undersizedPairs.length) {
                return null;
            }

            return {
                missingPairs,
                undersizedPairs,
                intersectionSize,
            };
        };

        /**
         * Render a non-blocking warning for multi-circle intersections that cannot draw.
         *
         * @param {H5P.jQuery} $row
         * @param {object} intersection
         * @param {number} intersectionIndex
         * @private
         */
        this._renderIntersectionWarning = function ($row, intersection, intersectionIndex) {
            const warning = self._getIntersectionWarning(intersection, intersectionIndex);

            if (!warning) {
                return;
            }

            const messages = [];

            if (warning.missingPairs.length) {
                messages.push(self.t('addPairwiseIntersections', { ':pairs': warning.missingPairs.join(', ') }));
            }

            if (warning.undersizedPairs.length) {
                messages.push(self.t('increasePairwiseSizes', {
                    ':size': String(warning.intersectionSize),
                    ':pairs': warning.undersizedPairs.join(', '),
                }));
            }

            if (!messages.length) {
                return;
            }

            $('<div>', {
                class: 'h5p-diagram-editor-intersection-warning',
                text: self.t('multiCircleIntersectionWarning', { ':details': messages.join(' ') }),
            }).appendTo($row);
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
                text: self.t('addIntersection'),
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

            const itemField = self.field.field || self.field;
            const fields = itemField.fields || [];
            const circleSetsField = fields.find((field) => field.name === 'sets') || {};
            const labelSemantic = fields.find((field) => field.name === 'label') || {};
            const sizeSemantic = fields.find((field) => field.name === 'size') || {};

            if (circleSetsField.description) {
                $('<div>', {
                    class: 'h5peditor-field-description',
                    html: circleSetsField.description,
                }).appendTo($row);
            }

            // Circles dropdowns
            self._normalizeIntersectionSets(intersection);

            intersection.sets.forEach(function (ref, setIdx) {
                self.renderCircleSelect($row, intersection, index, setIdx);
            });

            // "Add circle" button (optional 3rd or 4th circle)
            const circles = self._getCircles();
            if (intersection.sets.length < 4 && intersection.sets.length < circles.length) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5peditor-button-textual h5p-diagram-editor-add-circle',
                    text: self.t('addCircle'),
                })
                    .appendTo($row)
                    .on('click', function () {
                        const usedIndexes = intersection.sets
                            .map((ref) => typeof ref === 'object' ? Number(ref.circleIndex) : Number(ref))
                            .filter((index) => index >= 1);

                        let nextIndex = 1;

                        for (let i = 1; i <= circles.length; i++) {
                            if (!usedIndexes.includes(i)) {
                                nextIndex = i;
                                break;
                            }
                        }

                        intersection.sets.push({
                            circleIndex: nextIndex
                        });

                        self._normalizeIntersectionSets(intersection);
                        self.save();
                        self.render();
                    });
            }

            self._renderIntersectionWarning($row, intersection, index);

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
                text: labelSemantic.label || self.t('label'),
            }).appendTo(labelLabel);

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
                text: sizeSemantic.label || self.t('size'),
            }).appendTo(sizeLabel);

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
                self.render();
            });

            // Remove intersection button
            $('<button>', {
                type: 'button',
                class: 'h5peditor-button h5p-diagram-editor-remove-intersection',
                'aria-label': self.t('remove'),
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

            const circles = self._getCircles();

            circles.forEach(function (circle, index) {
                const circleIndex = index + 1;
                const fallbackLabel = self.t('circleLabel', { ':index': String(circleIndex) });
                const label = (circle.label || fallbackLabel).trim();

                $('<option>', {
                    value: String(circleIndex),
                    text: label || fallbackLabel,
                }).appendTo($select);
            });

            let currentIndex = typeof ref === 'object'
                ? Number(ref.circleIndex)
                : Number(ref);

            if (!currentIndex || currentIndex < 1 || currentIndex > circles.length) {
                currentIndex = Math.min(setIndex + 1, circles.length || 1);
                ref.circleIndex = currentIndex;
            }

            $select.val(String(currentIndex));

            $select.on('change', function () {
                intersection.sets[setIndex] = Number(this.value);

                self.save();
                self.render();
            });

            if (intersection.sets.length > 2) {
                $('<button>', {
                    type: 'button',
                    class: 'h5peditor-button h5p-diagram-editor-remove-circle',
                    'aria-label': self.t('remove'),
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
            if (Array.isArray(self.params)) {
                self.params.forEach(function (intersection) {
                    self._normalizeIntersectionSets(intersection);
                });
            }

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
                self.params.forEach(function (intersection) {
                    self._normalizeIntersectionSets(intersection);
                });
            }

            H5PEditor.DiagramEditorUtils.cleanIntersectionCircleIds(self.params);

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
