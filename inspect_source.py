import argofamiglia
import inspect

try:
    print(inspect.getsource(argofamiglia.ArgoFamiglia.getCompitiByDate))
except Exception as e:
    print(f"Could not get source: {e}")
