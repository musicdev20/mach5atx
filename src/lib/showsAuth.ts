import { createHash } from 'node:crypto';

const COOKIE_NAME = 'mach5_shows_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

const getExpectedDigest = (): string | null => {
    const password = import.meta.env.SHOWS_ADMIN_PASSWORD;
    if (!password) return null;
    return digest(password);
};

export const isShowsAdminEnabled = () => Boolean(getExpectedDigest());

export const isAuthorized = (request: Request): boolean => {
    const expected = getExpectedDigest();
    if (!expected) return false;
    const cookieHeader = request.headers.get('cookie') ?? '';
    const token = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE_NAME}=`))
        ?.split('=')[1];
    return token === expected;
};

export const verifyPassword = (password: string): boolean => {
    const expected = getExpectedDigest();
    if (!expected) return false;
    return digest(password) === expected;
};

export const buildAuthCookie = (): string | null => {
    const expected = getExpectedDigest();
    if (!expected) return null;
    const secure = import.meta.env.PROD ? '; Secure' : '';
    return `${COOKIE_NAME}=${expected}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
};

export const buildClearCookie = (): string => {
    const secure = import.meta.env.PROD ? '; Secure' : '';
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
};
