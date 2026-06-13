import { Router } from "express";

/**
 * Boot-time fail-safe: throws if any route on `router` lacks a permission guard
 * (a handler tagged by requirePermission) and is not explicitly exempt.
 * `exempt` entries are "METHOD /path" strings, e.g. "GET /profile".
 */

/**
 Route Stack Object cus my mem sux :P

 router.stack  =  [
   layer {                         
      route: {
         path:   "/book/add",
         methods: { post: true },
         stack: [                    
            { handle: <the requirePermission guard fn> },   ← has .__permission
            { handle: <adminController.addSchedule fn> }    ← no marker
         ]
      }
   },
   layer { route: {...} },          
   layer { route: {...} },          
   ...
]
 */

export function assertRoutesGuarded(router: Router, exempt: string[] = []) {

    //normalize "METHOD /path" — uppercase only the method, paths are case-sensitive.
    const normalize = (entry: string) => {
        const [method = "", ...rest] = entry.trim().split(/\s+/);
        return `${method.toUpperCase()} ${rest.join(" ")}`;
    };

    const exemptSet = new Set(exempt.map(normalize));
    const unguarded: string[] = [];

    for (const layer of (router as any).stack) {
        const route = layer.route;
        if (!route) continue; //skip non-route middleware layers

        const guarded = route.stack.some((l: any) => l.handle && l.handle.__permission);
        const methods = Object.keys(route.methods).map((m) => m.toUpperCase());

        for (const method of methods) {
            const key = `${method} ${route.path}`;
            if (guarded || exemptSet.has(key)) continue;
            unguarded.push(key);
        }
    }

    if (unguarded.length > 0) {
        throw new Error(
            `[route-guard] Admin route(s) missing a permission guard and not exempt:\n  ` +
            unguarded.join("\n  ") +
            `\nAdd requirePermission(Permission.X) or add the route to the exempt list.`
        );
    }
}