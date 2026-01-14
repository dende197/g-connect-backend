import argofamiglia
import inspect

try:
    print("--- Init Signature ---")
    print(inspect.signature(argofamiglia.ArgoFamiglia.__init__))
    
    print("\n--- Init Source ---")
    print(inspect.getsource(argofamiglia.ArgoFamiglia.__init__))
except Exception as e:
    print(e)
