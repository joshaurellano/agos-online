"""
Compatibility shim for loading these particular .h5 files under the
tensorflow/keras versions in requirements.txt.

The three .h5 models were saved by a Keras build whose initializers
(GlorotUniform, etc.) serialize extra config fields -- `input_axes` /
`output_axes` -- that the constructors of those same classes in the
installed Keras version don't accept:

    GlorotUniform.__init__() got an unexpected keyword argument 'input_axes'

This is a pure (de)serialization mismatch, not a problem with the
trained weights: it only affects how the *initializer object* gets
reconstructed while parsing the saved config, and initializers are only
ever used to generate starting values for a layer's weights -- something
that never happens during inference/loading of already-trained weights.

The fix: wrap every keras.initializers class so unknown kwargs coming
from a saved config are silently dropped instead of raising, unless the
class already accepts **kwargs itself. This has to run before
`load_model()` is called on any of the three .h5 files.
"""

import inspect

import keras


_PATCHED_FLAG = "_agos_compat_patched"


def patch_incompatible_initializers():
    """
    Idempotent: safe to call multiple times (e.g. once per module import).
    """
    if getattr(keras.initializers, _PATCHED_FLAG, False):
        return

    for name in dir(keras.initializers):
        obj = getattr(keras.initializers, name)

        if not (
            inspect.isclass(obj)
            and issubclass(obj, keras.initializers.Initializer)
        ):
            continue

        orig_init = obj.__init__

        if getattr(orig_init, "_agos_compat_wrapped", False):
            continue

        try:
            sig = inspect.signature(orig_init)
        except (TypeError, ValueError):
            continue

        params = sig.parameters.values()
        already_accepts_anything = any(
            p.kind == inspect.Parameter.VAR_KEYWORD for p in params
        )
        if already_accepts_anything:
            continue

        allowed = {p.name for p in params} - {"self"}

        def make_wrapper(orig_init=orig_init, allowed=allowed, class_name=name):
            def wrapper(self, *args, **kwargs):
                unknown = set(kwargs) - allowed
                if unknown:
                    filtered = {k: v for k, v in kwargs.items() if k in allowed}
                    return orig_init(self, *args, **filtered)
                return orig_init(self, *args, **kwargs)

            wrapper._agos_compat_wrapped = True
            return wrapper

        obj.__init__ = make_wrapper()

    setattr(keras.initializers, _PATCHED_FLAG, True)
