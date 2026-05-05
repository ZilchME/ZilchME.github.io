---
title: ThreadLocal 在后端开发的使用场景
tags:
  - Java
  - 多线程
createTime: 2026/04/11 15:20:34
permalink: /blog/ofpnpou0/
---

在 Spring 后端开发中，通常需要在请求处理的各个层级（Controller、Service、Mapper 等）获取当前登录用户的信息，例如员工 ID。传统做法是通过方法参数层层传递，但这种方式存在明显缺陷：

- 方法签名冗余，每个方法都需要额外声明 `empId` 参数
- 代码侵入性强，修改业务逻辑时需同步调整参数传递链路
- 维护成本高，新增调用点容易遗漏参数传递

```java
// Controller 层
public Result delete(@PathVariable Long id, @RequestHeader("empId") Long empId) {
    return service.delete(id, empId);
}

// Service 层
public void delete(Long id, Long empId) {
    mapper.updateStatus(id, 0, empId);
    auditLog(id, empId); // 仍需继续传递
}

// Mapper 或工具类
public void auditLog(Long id, Long empId) {
    // 记录操作日志
}
```

## ThreadLocal 解决方案

通过 `ThreadLocal` 实现请求上下文的线程内共享，可避免参数层层传递：

```java
// 上下文工具类
public class BaseContext {
    private static final ThreadLocal<Long> threadLocal = new ThreadLocal<>();

    public static void setCurrentId(Long id) {
        threadLocal.set(id);
    }

    public static Long getCurrentId() {
        return threadLocal.get();
    }

    public static void removeCurrentId() {
        threadLocal.remove();
    }
}
```

在拦截器中设置上下文：

```java
@Component
@Slf4j
public class JwtTokenAdminInterceptor implements HandlerInterceptor {

    @Autowired
    private JwtProperties jwtProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, 
                           HttpServletResponse response, 
                           Object handler) throws Exception {
        // 非 Controller 方法直接放行
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        // 1. 从请求头获取令牌
        String token = request.getHeader(jwtProperties.getAdminTokenName());

        // 2. 校验令牌并提取用户信息
        try {
            Claims claims = JwtUtil.parseJWT(jwtProperties.getAdminSecretKey(), token);
            Long empId = Long.valueOf(claims.get(JwtClaimsConstant.EMP_ID).toString());
            
            // 3. 存入 ThreadLocal，供后续业务使用
            BaseContext.setCurrentId(empId);
            return true;
        } catch (Exception ex) {
            response.setStatus(401);
            return false;
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, 
                              HttpServletResponse response, 
                              Object handler, Exception ex) {
        // 4. 请求结束后清理上下文，防止内存泄漏
        BaseContext.removeCurrentId();
    }
}
```

使用时无需修改方法签名，任意层级均可获取当前用户 ID：

```java
// Service 层
public void delete(Long id) {
    Long empId = BaseContext.getCurrentId(); // 直接获取
    mapper.updateStatus(id, 0, empId);
}
```

## 为什么使用 ThreadLocal

### Web 容器的线程模型

```text
请求 A → Tomcat 线程池 Thread-1 → 完整处理流程
请求 B → Tomcat 线程池 Thread-2 → 完整处理流程
```

- 每个 HTTP 请求由独立线程处理
- `ThreadLocal` 为每个线程提供独立的数据副本
- 请求间数据天然隔离，Thread-1 设置的 `empId=1001` 不会影响 Thread-2 的 `empId=1002`

### 底层实现原理

```java
// Thread 类内部维护 ThreadLocalMap
class Thread {
    ThreadLocalMap threadLocals;
}

// ThreadLocalMap 结构
class ThreadLocalMap {
    static class Entry extends WeakReference<ThreadLocal<?>> {
        Object value; // 存储的实际数据，如 Long empId
    }
    Entry[] table; // 哈希表存储所有 ThreadLocal 变量
}
```

数据存取本质是 `当前线程.threadLocals.get(this)`，无需加锁即可保证线程安全。

## 关键注意事项：必须调用 remove()

### 不清理的风险

Tomcat 等 Web 容器使用线程池复用线程。若请求结束后未清理 `ThreadLocal`：

```text
时序示例：
1. 请求 1 由 Thread-1 处理，设置 empId=1001
2. 请求 1 结束，未调用 remove()，Thread-1 返回线程池
3. 请求 2 复用 Thread-1，调用 getCurrentId() 错误获取到 1001
```

**后果**：

- 数据泄露：后续请求可能读取到前一个请求的上下文数据
- 内存泄漏：`ThreadLocal` 的 key 是弱引用，但 value 是强引用。若线程长期存活（如线程池），value 无法被回收

### 正确的清理方式

方案一：拦截器中统一清理（推荐）

```java
@Override
public void afterCompletion(HttpServletRequest request, 
                          HttpServletResponse response, 
                          Object handler, Exception ex) {
    BaseContext.removeCurrentId();
}
```

方案二：业务代码中使用 try-finally

```java
try {
    BaseContext.setCurrentId(empId);
    // 执行业务逻辑
} finally {
    BaseContext.removeCurrentId();
}
```

## 异步场景的处理

`ThreadLocal` 的数据绑定于当前线程，在异步执行时（如 `@Async`、`CompletableFuture`、线程池提交任务）会丢失上下文：

```java
// ❌ 错误示例：子线程无法获取父线程的 ThreadLocal 值
CompletableFuture.runAsync(() -> {
    Long empId = BaseContext.getCurrentId(); // 返回 null
});
```

### 解决方案

方案一：手动传递上下文

```java
Long empId = BaseContext.getCurrentId();
CompletableFuture.runAsync(() -> {
    try {
        BaseContext.setCurrentId(empId);
        // 子线程业务逻辑
    } finally {
        BaseContext.removeCurrentId();
    }
});
```

方案二：使用 TransmittableThreadLocal（推荐）

阿里开源的 [TransmittableThreadLocal](https://github.com/alibaba/transmittable-thread-local) 可自动在线程池复用或子线程创建时传递上下文：

```java
// 替换 ThreadLocal 声明
private static final TransmittableThreadLocal<Long> threadLocal = new TransmittableThreadLocal<>();

// 需配合 TTL 装饰线程池
ExecutorService executor = TtlExecutors.getTtlExecutorService(Executors.newFixedThreadPool(10));
```

## 总结

`BaseContext.setCurrentId(empId)` 的核心价值在于：

> 将当前请求的操作人 ID 安全地绑定到处理该请求的线程，使同线程内的所有代码层级均可无侵入地获取上下文信息，使用完毕后及时清理以避免副作用。

**使用要点**：

1. 适用于请求生命周期内的上下文传递，如用户信息、租户 ID、链路追踪 ID 等
2. 严格遵循 `set → get → remove` 的闭环管理
3. 异步场景需额外处理上下文传递
4. 避免在 `ThreadLocal` 中存储大对象，防止内存占用过高

通过合理使用 `ThreadLocal`，可显著降低业务代码的耦合度，提升系统的可维护性与扩展性。