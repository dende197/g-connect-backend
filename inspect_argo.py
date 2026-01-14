import argofamiglia
import inspect

try:
    sig = inspect.signature(argofamiglia.ArgoFamiglia.getCompitiByDate)
    print(f"Signature: {sig}")
except Exception as e:
    print(f"Could not get signature: {e}")
