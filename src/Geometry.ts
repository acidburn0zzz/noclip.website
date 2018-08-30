
import { vec3, mat4 } from "gl-matrix";
import { nArray } from "./util";

class Plane {
    private static scratchVec3: vec3[] = nArray(2, () => vec3.create());
    // Plane normal
    public x: number;
    public y: number;
    public z: number;
    // Distance
    public d: number;

    public test(x: number, y: number, z: number): number {
        const dot = x*this.x + y*this.y + z*this.z;
        return this.d + dot;
    }

    public set(p0: vec3, p1: vec3, p2: vec3): void {
        const scratch = Plane.scratchVec3;
        vec3.sub(scratch[0], p2, p0);
        vec3.sub(scratch[1], p1, p0);
        vec3.cross(scratch[0], scratch[0], scratch[1]);
        vec3.normalize(scratch[0], scratch[0]);
        this.x = scratch[0][0];
        this.y = scratch[0][1];
        this.z = scratch[0][2];
        this.d = -vec3.dot(scratch[0], p0);
    }
}

const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
const scratchVec3c = vec3.create();
const scratchVec3d = vec3.create();
export class AABB {
    constructor(
        public minX: number = 0,
        public minY: number = 0,
        public minZ: number = 0,
        public maxX: number = 0,
        public maxY: number = 0,
        public maxZ: number = 0,
    ) {}

    public transform(src: AABB, m: mat4): void {
        // Transforming Axis-Aligned Bounding Boxes from Graphics Gems.
        const srcMin = scratchVec3a, srcMax = scratchVec3b;
        vec3.set(srcMin, src.minX, src.minY, src.minZ);
        vec3.set(srcMax, src.maxX, src.maxY, src.maxZ);
        const dstMin = scratchVec3c, dstMax = scratchVec3d;

        // Translation can be applied directly.
        vec3.set(dstMin, m[12], m[13], m[14]);
        vec3.set(dstMax, m[12], m[13], m[14]);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const a = m[j*4+i] * srcMin[j];
                const b = m[j*4+i] * srcMax[j];
                if (a < b) {
                    dstMin[i] += a;
                    dstMax[i] += b;
                } else {
                    dstMin[i] += b;
                    dstMax[i] += a;
                }
            }
        }

        this.minX = dstMin[0];
        this.minY = dstMin[1];
        this.minZ = dstMin[2];
        this.maxX = dstMax[0];
        this.maxY = dstMax[1];
        this.maxZ = dstMax[2];
    }

    public set(points: vec3[]): void {
        this.minX = this.minY = this.minZ = Infinity;
        this.maxX = this.maxY = this.maxZ = -Infinity;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            this.minX = Math.min(this.minX, p[0]);
            this.minY = Math.min(this.minY, p[1]);
            this.minZ = Math.min(this.minZ, p[2]);
            this.maxX = Math.max(this.maxX, p[0]);
            this.maxY = Math.max(this.maxY, p[1]);
            this.maxZ = Math.max(this.maxZ, p[2]);
        }
    }

    public static intersect(a: AABB, b: AABB): boolean {
        return !(
            a.minX > b.maxX || b.minX > a.maxX ||
            a.minY > b.maxY || b.minY > a.maxY ||
            a.minZ > b.maxZ || b.minZ > a.maxZ);
    }
}

class FrustumVisualizer {
    private canvas: HTMLCanvasElement;
    public ctx: CanvasRenderingContext2D;
    public scale: number = 1/100000;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1080;
        this.canvas.height = 768;
        document.body.appendChild(this.canvas);
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.opacity = '0.5';
        this.canvas.style.pointerEvents = 'none';
        this.ctx = this.canvas.getContext('2d');
    }

    public newFrame(): void {
        this.ctx.fillStyle = 'white';
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
    }

    public dsx(n: number): number {
        return ((n*this.scale) + 0.5) * this.canvas.width;
    }

    public dsy(n: number): number {
        return ((n*this.scale) + 0.5) * this.canvas.height;
    }

    public daabb/* on the haters */(aabb: AABB): void {
        const x1 = this.dsx(aabb.minX);
        const y1 = this.dsy(aabb.minZ);
        const x2 = this.dsx(aabb.maxX);
        const y2 = this.dsy(aabb.maxZ);
        this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
}

export enum IntersectionState {
    FULLY_INSIDE,
    FULLY_OUTSIDE,
    PARTIAL_INTERSECT,
}

export class Frustum {
    private static scratchPlaneVec3 = nArray(9, () => vec3.create());

    // View-space configuration.
    public left: number;
    public right: number;
    public bottom: number;
    public top: number;
    public near: number;
    public far: number;

    // World-space configuration.
    public aabb: AABB = new AABB();
    // Left, Right, Near, Far, Top, Bottom
    public planes: Plane[] = nArray(6, () => new Plane());

    private visualizer: FrustumVisualizer | null = null;
    public makeVisualizer(): void {
        this.visualizer = new FrustumVisualizer();
    }

    public setViewFrustum(left: number, right: number, bottom: number, top: number, n: number, f: number): void {
        this.left = left;
        this.right = right;
        this.bottom = bottom;
        this.top = top;
        this.near = -n;
        this.far = -f;
    }

    public updateWorldFrustum(worldMatrix: mat4): void {
        const scratch = Frustum.scratchPlaneVec3;

        const fn = this.far / this.near;
        vec3.set(scratch[0], this.left, this.top, this.near);
        vec3.set(scratch[1], this.right, this.top, this.near);
        vec3.set(scratch[2], this.right, this.bottom, this.near);
        vec3.set(scratch[3], this.left, this.bottom, this.near);
        vec3.set(scratch[4], fn * this.left, fn * this.top, this.far);
        vec3.set(scratch[5], fn * this.right, fn * this.top, this.far);
        vec3.set(scratch[6], fn * this.right, fn * this.bottom, this.far);
        vec3.set(scratch[7], fn * this.left, fn * this.bottom, this.far);
        vec3.set(scratch[8], 0, 0, 0);

        for (let i = 0; i < 9; i++)
            vec3.transformMat4(scratch[i], scratch[i], worldMatrix);

        this.aabb.set(scratch);

        this.planes[0].set(scratch[8], scratch[3], scratch[0]); // left plane
        this.planes[1].set(scratch[8], scratch[1], scratch[2]); // right plane
        this.planes[2].set(scratch[0], scratch[1], scratch[2]); // near plane
        this.planes[3].set(scratch[4], scratch[7], scratch[6]); // far plane
        this.planes[4].set(scratch[8], scratch[0], scratch[1]); // top plane
        this.planes[5].set(scratch[8], scratch[2], scratch[3]); // bottom plane

        if (this.visualizer) {
            const ctx = this.visualizer.ctx;
            const scale = this.visualizer.scale;
            // TODO(jstpierre): why isn't this working?
            ctx.setTransform(1, 0, 0, 1, -worldMatrix[12]*scale, -worldMatrix[14]*scale);
            ctx.strokeStyle = 'red';
            this.visualizer.daabb(this.aabb);

            vec3.set(scratch[0], this.left, 0, this.near);
            vec3.set(scratch[1], this.right, 0, this.near);
            vec3.set(scratch[2], fn * this.right, 0, this.far);
            vec3.set(scratch[3], fn * this.left, 0, this.far);

            ctx.strokeStyle = 'green';
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const p = scratch[i];
                vec3.transformMat4(p, p, worldMatrix);
                const x = this.visualizer.dsx(p[0]);
                const y = this.visualizer.dsy(p[2]);
                ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    public _intersect(aabb: AABB): IntersectionState {
        if (!AABB.intersect(this.aabb, aabb))
            return IntersectionState.FULLY_OUTSIDE;

        let ret = IntersectionState.FULLY_INSIDE;
        // Test planes.
        for (let i = 0; i < 6; i++) {
            const plane = this.planes[i];
            // Nearest point to the frustum.
            const px = plane.x >= 0 ? aabb.minX : aabb.maxX;
            const py = plane.y >= 0 ? aabb.minY : aabb.maxY;
            const pz = plane.z >= 0 ? aabb.minZ : aabb.maxZ;
            if (plane.test(px, py, pz) > 0)
                return IntersectionState.FULLY_OUTSIDE;
            // Farthest point from the frustum.
            const fx = plane.x >= 0 ? aabb.maxX : aabb.minX;
            const fy = plane.y >= 0 ? aabb.maxY : aabb.minY;
            const fz = plane.z >= 0 ? aabb.maxZ : aabb.minZ;
            if (plane.test(fx, fy, fz) > 0)
                ret = IntersectionState.PARTIAL_INTERSECT;
        }

        return ret;
    }

    public intersect(aabb: AABB): IntersectionState {
        const res = this._intersect(aabb);

        if (this.visualizer) {
            const ctx = this.visualizer.ctx;
            ctx.strokeStyle = res === IntersectionState.FULLY_INSIDE ? 'black' : res === IntersectionState.FULLY_OUTSIDE ? 'red' : 'cyan';
            this.visualizer.daabb(aabb);
        }

        return res;
    }

    public newFrame(): void {
        if (this.visualizer)
            this.visualizer.newFrame();
    }
}
