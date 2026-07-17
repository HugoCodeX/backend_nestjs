import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, payload);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors;
}

describe('UpdateProfileDto', () => {
  describe('campos válidos', () => {
    it('acepta un objeto vacío (todo opcional)', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });

    it('acepta firstName dentro del rango', async () => {
      const errors = await validateDto({ firstName: 'Hugo' });
      expect(errors).toHaveLength(0);
    });

    it('acepta firstName de exactamente 100 chars', async () => {
      const errors = await validateDto({ firstName: 'a'.repeat(100) });
      expect(errors).toHaveLength(0);
    });

    it('acepta lastName dentro del rango', async () => {
      const errors = await validateDto({ lastName: 'Pérez' });
      expect(errors).toHaveLength(0);
    });

    it('acepta bio hasta 2000 chars', async () => {
      const errors = await validateDto({ bio: 'a'.repeat(2000) });
      expect(errors).toHaveLength(0);
    });

    it('acepta avatarUrl con http', async () => {
      const errors = await validateDto({ avatarUrl: 'http://example.com/a.png' });
      expect(errors).toHaveLength(0);
    });

    it('acepta avatarUrl con https', async () => {
      const errors = await validateDto({ avatarUrl: 'https://example.com/a.png' });
      expect(errors).toHaveLength(0);
    });

    it('acepta avatarUrl con localhost', async () => {
      const errors = await validateDto({ avatarUrl: 'http://localhost:3000/avatars/1.png' });
      expect(errors).toHaveLength(0);
    });

    it('acepta todos los campos juntos', async () => {
      const errors = await validateDto({
        firstName: 'Hugo',
        lastName: 'Pérez',
        bio: 'Dev',
        avatarUrl: 'https://example.com/a.png',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('validación de longitud', () => {
    it('rechaza firstName de 101 chars', async () => {
      const errors = await validateDto({ firstName: 'a'.repeat(101) });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('firstName');
    });

    it('rechaza firstName vacío (MinLength 1)', async () => {
      const errors = await validateDto({ firstName: '' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('firstName');
    });

    it('rechaza lastName de 101 chars', async () => {
      const errors = await validateDto({ lastName: 'a'.repeat(101) });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rechaza bio de 2001 chars', async () => {
      const errors = await validateDto({ bio: 'a'.repeat(2001) });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('bio');
    });

    it('rechaza avatarUrl > 2048 chars', async () => {
      const errors = await validateDto({ avatarUrl: 'https://example.com/' + 'a'.repeat(2040) });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validación de tipo', () => {
    it('rechaza firstName que no es string', async () => {
      const errors = await validateDto({ firstName: 123 as unknown as string });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rechaza avatarUrl con formato inválido (sin host)', async () => {
      const errors = await validateDto({ avatarUrl: 'http://' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rechaza avatarUrl con espacios en medio', async () => {
      const errors = await validateDto({ avatarUrl: 'http://exa mple.com/a.png' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rechaza avatarUrl con protocolo inválido (ftp)', async () => {
      const errors = await validateDto({ avatarUrl: 'ftp://example.com/a.png' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('trim', () => {
    it('trimea whitespace en firstName', async () => {
      const dto = plainToInstance(UpdateProfileDto, { firstName: '  Hugo  ' });
      expect(dto.firstName).toBe('Hugo');
    });

    it('trimea whitespace en lastName', async () => {
      const dto = plainToInstance(UpdateProfileDto, { lastName: '  Pérez  ' });
      expect(dto.lastName).toBe('Pérez');
    });

    it('trimea whitespace en bio', async () => {
      const dto = plainToInstance(UpdateProfileDto, { bio: '  algo  ' });
      expect(dto.bio).toBe('algo');
    });

    it('NO trimea valores undefined (devuelve undefined)', async () => {
      const dto = plainToInstance(UpdateProfileDto, { firstName: undefined });
      expect(dto.firstName).toBeUndefined();
    });
  });
});
