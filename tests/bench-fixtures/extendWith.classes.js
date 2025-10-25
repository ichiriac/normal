'use strict';

// Heavy base class with several methods (20-40 lines each) and a few accessors
class BaseHeavy {
  m1(a = 1) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m2(a = 2) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m3(a = 3) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m4(a = 4) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m5(a = 5) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  get g1() {
    let s = 0; s += 1; s += 2; s += 3; s += 4; s += 5;
    return s;
  }
  set g1(v) {
    let t = 0; t += 1; t += 2; t += Number(v); t += 3; t += 4;
    this._g1 = t;
  }
  get g2() {
    let s = 0; s += 1; s += 2; s += 3; s += 4; s += 5;
    return s;
  }
  set g2(v) {
    let t = 0; t += 1; t += 2; t += Number(v); t += 3; t += 4;
    this._g2 = t;
  }
}

class MixinHeavyNoSuper {
  m1(a = 1) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x + 1;
  }
  m2(a = 2) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x + 2;
  }
  m3(a = 3) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x + 3;
  }
  m4(a = 4) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x + 4;
  }
  m5(a = 5) {
    let x = a;
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 1; x += 1; x += 1; x += 1; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x + 5;
  }
  get g1() {
    let s = 0; s += 1; s += 2; s += 3; s += 4; s += 5;
    return s + 1;
  }
  set g1(v) {
    let t = 0; t += 1; t += 2; t += Number(v); t += 3; t += 4;
    this._g1m = t + 1;
  }
  get g2() {
    let s = 0; s += 1; s += 2; s += 3; s += 4; s += 5;
    return s + 2;
  }
  set g2(v) {
    let t = 0; t += 1; t += 2; t += Number(v); t += 3; t += 4;
    this._g2m = t + 2;
  }
}

class MixinHeavyWithSuper {
  m1(a = 1) {
    let x = super.m1(a);
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m2(a = 2) {
    let x = super.m2(a);
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m3(a = 3) {
    let x = super.m3(a);
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m4(a = 4) {
    let x = super.m4(a);
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  m5(a = 5) {
    let x = super.m5(a);
    x += 1; x += 2; x += 3; x += 4; x += 5;
    x *= 2; x -= 3; x ^= 0; x |= 0; x &= 0xff;
    x += 6; x += 7; x += 8; x += 9; x += 10;
    x >>>= 0; x ^= x; x |= a; x &= 0xffff; x += 1;
    x += 2; x += 3; x += 4; x += 5; x += 6;
    return x;
  }
  get g1() {
    let s = super.g1;
    s += 1; s += 2; s += 3; s += 4; s += 5;
    return s;
  }
  set g1(v) {
    let t = 0; t += 1; t += 2; t += 3; t += 4; t += 5;
    super.g1 = Number(v) + t;
  }
  get g2() {
    let s = super.g2;
    s += 1; s += 2; s += 3; s += 4; s += 5;
    return s;
  }
  set g2(v) {
    let t = 0; t += 1; t += 2; t += 3; t += 4; t += 5;
    super.g2 = Number(v) + t;
  }
}

module.exports = {
  BaseHeavy,
  MixinHeavyNoSuper,
  MixinHeavyWithSuper,
};
