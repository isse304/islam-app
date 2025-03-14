declare module 'compression' {
    import { RequestHandler } from 'express';
    function compression(): RequestHandler;
    export = compression;
}

declare module 'helmet' {
    import { RequestHandler } from 'express';
    
    interface HelmetOptions {
        contentSecurityPolicy?: {
            directives?: {
                [key: string]: string[] | boolean;
            };
        };
        crossOriginEmbedderPolicy?: boolean;
        crossOriginOpenerPolicy?: boolean;
        crossOriginResourcePolicy?: {
            policy?: string;
        };
        [key: string]: any;
    }
    
    function helmet(options?: HelmetOptions): RequestHandler;
    export = helmet;
}

declare module 'axios' {
    interface AxiosResponse<T = any> {
        data: T;
        status: number;
        statusText: string;
        headers: any;
        config: any;
    }

    interface AxiosInstance {
        get<T = any>(url: string, config?: any): Promise<AxiosResponse<T>>;
        post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>;
        put<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>>;
        delete<T = any>(url: string, config?: any): Promise<AxiosResponse<T>>;
    }

    function create(config?: any): AxiosInstance;
    const axios: AxiosInstance & { create: typeof create };
    export default axios;
}

declare module 'express-rate-limit' {
    import { RequestHandler } from 'express';
    
    interface Options {
        windowMs?: number;
        max?: number;
        message?: string;
        statusCode?: number;
        [key: string]: any;
    }

    function rateLimit(options?: Options): RequestHandler;
    export = rateLimit;
}

declare module 'nodemailer' {
    interface SendMailOptions {
        from?: string;
        to?: string | string[];
        subject?: string;
        text?: string;
        html?: string;
        [key: string]: any;
    }

    interface Transporter {
        sendMail(options: SendMailOptions): Promise<any>;
    }

    interface TransportOptions {
        service?: string;
        host?: string;
        port?: number;
        secure?: boolean;
        auth?: {
            user?: string;
            pass?: string;
        };
        [key: string]: any;
    }

    function createTransport(options: TransportOptions): Transporter;
    
    interface NodemailerModule {
        createTransport: typeof createTransport;
        Transporter: Transporter;
    }

    const nodemailer: NodemailerModule;
    export = nodemailer;
} 