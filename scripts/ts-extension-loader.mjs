// 让 Node 原生执行 TypeScript 规则测试时能解析无扩展名的相对导入。
// 参考版 HIAS-CSA 使用同一做法：不引入 esbuild，避免子进程管道依赖。
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/[.][a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
