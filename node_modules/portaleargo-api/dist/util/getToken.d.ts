import type { LoginLink } from "../types";
export declare const getToken: (code: LoginLink & {
    code: string;
}) => Promise<{
    access_token: string;
    expires_in: number;
    id_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
} & {
    expireDate: Date;
}>;
