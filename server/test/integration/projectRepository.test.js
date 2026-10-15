import {afterEach, expect, it, vi} from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../src/db.js', () => ({query}));
const projectRepository = await import('../../src/repositories/projectRepository.js');

afterEach(() => vi.clearAllMocks());

it('maps a project lookup to a parameterized query', async () => {
    query.mockImplementation(async () => ({
        rows: [{id: 3, name: 'Dashboard'}],
    }));

    const result = await projectRepository.findById(3);

    expect(result).toEqual({id: 3, name: 'Dashboard'});
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([3]);
    expect(query.mock.calls[0][0]).toMatch(/WHERE p\.id = \$1/);
});

it('returns null when a project is absent', async () => {
    query.mockImplementation(async () => ({rows: []}));

    expect(await projectRepository.remove(42)).toBeNull();
});
