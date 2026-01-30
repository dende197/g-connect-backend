import type { JSONSchemaType } from "ajv";
import type { APIOperation, APIResponse } from "../types";
export declare const base: {
    readonly type: "object";
    readonly additionalProperties: false;
};
export declare const allRequired: <T, P extends JSONSchemaType<T>["properties"] = JSONSchemaType<T>["properties"]>(properties: P) => typeof base & {
    properties: P;
    required: (keyof P)[];
};
export declare const boolean: JSONSchemaType<boolean>;
export declare const string: JSONSchemaType<string>;
export declare const number: JSONSchemaType<number>;
export declare const nullableString: JSONSchemaType<string>;
export declare const nullableNumber: JSONSchemaType<number>;
export declare const record: <K extends number | string | symbol, T>(name: JSONSchemaType<K>, value: JSONSchemaType<T>) => JSONSchemaType<Record<K, T>>;
export declare const apiResponse: <T>(data: T extends APIResponse<infer A> ? JSONSchemaType<A> : never) => JSONSchemaType<T>;
export declare const array: <T extends any[] | null>(items: JSONSchemaType<NonNullable<T>[number]>, options?: Partial<JSONSchemaType<T>>) => JSONSchemaType<T>;
export declare const merge: <A, B>(first: JSONSchemaType<A>, second: JSONSchemaType<B>) => JSONSchemaType<A & B>;
export declare const apiOperation: <T, P extends boolean = false>(items: JSONSchemaType<T>, omitPk?: P) => JSONSchemaType<(P extends true ? Omit<APIOperation<T>, "pk"> : APIOperation<T>)[]>;
export declare const any: JSONSchemaType<any>;
export declare const arrayOfAny: JSONSchemaType<any[]>;
