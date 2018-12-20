declare module 'http-cache-semantics' {
  interface HttpCacheSemanticsOptions {
    shared: boolean;
  }

  interface CachePolicyObject {
    v: number;
    t: number;
    sh: boolean;
    ch: number;
    imm: number;
    st: number;
    resh: { [key: string]: string };
    rescc: { [key: string]: string };
    m: string;
    u: string;
    h: any;
    a: boolean;
    reqh: { [key: string]: string };
    reqcc: { [key: string]: string };
  }

  class CachePolicy {
    constructor(request: any, response: any, options?: HttpCacheSemanticsOptions);

    public storable(): boolean;
    public timeToLive(): number;
    public age(): number;
    public maxAge(): number;
    public satisfiesWithoutRevalidation(request: any): boolean;
    public responseHeaders(): { [key: string]: string };
    public toObject(): CachePolicyObject;
    public static fromObject(policyObj: CachePolicyObject): CachePolicy;
  }

  export = CachePolicy;
}
