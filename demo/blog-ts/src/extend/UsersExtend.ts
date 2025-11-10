export class UsersExtend {
  static _name = 'Users';
  static fields = {
    picture: { type: 'string', required: false },
  } as const;

  get profilePictureUrl(): string {
    const self: any = this as any;
    if (self.picture) {
      return `https://cdn.example.com/profiles/${self.picture}`;
    }
    return 'https://cdn.example.com/profiles/default.png';
  }
}

export default UsersExtend;
