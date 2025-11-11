import { regex } from 'arkregex';

export const TRAILING_SLASH_PATTERN = regex.as('/+$');
export const OPTIONAL_TRAILING_SLASH_PATTERN = regex.as('/?$');
export const LEADING_SLASH_PATTERN = regex.as('^/+');
