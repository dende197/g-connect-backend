import argofamiglia
import inspect

try:
    print(inspect.getsource(argofamiglia.ArgoFamiglia.connect))
except Exception as e:
    print(e)
