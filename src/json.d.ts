declare module '*.json' {
    export default interface JsonModule extends Object {
        [key: string]: any;
    }
} 