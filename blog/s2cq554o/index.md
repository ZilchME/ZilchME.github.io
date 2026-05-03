---
url: /blog/s2cq554o/index.md
---
在 Spring 生态中，目前负载均衡主要通过 **Spring Cloud LoadBalancer** 实现，属于**客户端负载均衡**（Client-Side Load Balancing）。它与 Spring Cloud 的服务注册中心、远程调用组件深度集成，是替代已废弃的 Netflix Ribbon 的官方标准方案。

> 注意：Spring 的负载均衡是**客户端侧**实现的，即调用方在发起请求前，自行从注册中心获取实例列表并选择目标节点。区别于 Nginx/Gateway 等服务端负载均衡。

## 工作原理

1. **服务发现拉取实例**：通过 `ServiceInstanceListSupplier` 从注册中心（Nacos/Eureka/Consul 等）获取健康实例列表。
2. **实例过滤与缓存**：默认剔除不健康实例，可选开启本地缓存减少注册中心压力。
3. **策略选择实例**：由 `ReactorLoadBalancer<ServiceInstance>` 根据配置策略（默认轮询）选出目标实例。
4. **拦截调用替换 URL**：将逻辑服务名（如 `http://order-service/api/xxx`）替换为真实 `ip:port` 后发起请求。

核心接口：

```java
// 响应式负载均衡器（核心）
public interface ReactorLoadBalancer<T> {
    Mono<Response<T>> choose(Request request);
}

// 实例列表提供者
public interface ServiceInstanceListSupplier extends Supplier<Flux<List<ServiceInstance>>> {}
```

## 集成方式

### Spring Cloud OpenFeign

Spring Cloud 2020.0.0+ 默认使用 LoadBalancer，无需额外配置：

```java
@FeignClient(name = "user-service")
public interface UserClient {
    @GetMapping("/api/users/{id}")
    User getUser(@PathVariable Long id);
}
```

> 💡 依赖要求：`spring-cloud-starter-openfeign` + `spring-cloud-starter-loadbalancer`

### `RestTemplate` + `@LoadBalanced`

::: details `RestTemplate` + `@LoadBalanced`

```java
@Configuration
public class RestTemplateConfig {
    @Bean
    @LoadBalanced // 注入 LoadBalancerInterceptor
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}

// 使用
restTemplate.getForObject("http://user-service/api/users", String.class);
```

:::

### `WebClient`（响应式）

::: details `WebClient`（响应式）

```java
@Bean
public WebClient webClient(LoadBalancerExchangeFilterFunction lbFilter) {
    return WebClient.builder()
            .filter(lbFilter) // 注入负载均衡过滤器
            .build();
}
```

:::

## 自定义与高级配置

### 更换负载均衡策略（示例：随机策略）

```java
@Configuration
@LoadBalancerClient(name = "user-service", configuration = RandomLBConfig.class)
public class RandomLBConfig {
    @Bean
    public ReactorLoadBalancer<ServiceInstance> randomLoadBalancer(Environment env, LoadBalancerClientFactory factory) {
        String name = env.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new RandomLoadBalancer(factory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
    }
}
```

> 内置策略：`RoundRobinLoadBalancer`（默认）、`RandomLoadBalancer`、`ZoneAvoidanceRule`（需自行实现）

### 常见「调度算法」分类

| 策略 | 说明 | 适用场景 |
| ------ | ------ | ---------- |
| **轮询（Round Robin）** | 依次分发请求 | 实例性能均匀、无状态服务 |
| **加权轮询（Weighted RR）** | 按权重分配流量 | 实例规格不一（如 2C4G vs 8C16G） |
| **最少连接（Least Connections）** | 优先发给当前活跃连接最少的实例 | 长连接、请求处理时长差异大的场景 |
| **一致性哈希（Consistent Hash）** | 相同 key（如 user\_id）始终路由到同一实例 | 缓存亲和、会话保持、分布式事务 |
| **地域/可用区感知（Zone-Aware）** | 优先调用同机房/同区域实例 | 跨地域部署、降低网络延迟 |
| **动态反馈（Adaptive）** | 基于实时指标（CPU/RT/错误率）动态调整 | 高弹性场景，常与 Service Mesh 结合 |

### 常用配置项（`application.yml`）

```yaml
spring:
  cloud:
    loadbalancer:
      retry:
        enabled: true          # 启用重试（需配合 spring-retry）
      cache:
        enabled: true          # 缓存实例列表，默认 30s
        ttl: 60s
      health-check:
        refetch-instances-interval: 10s # 健康检查刷新间隔
```

### 结合注册中心特性

* **Nacos**：自动同步权重、健康状态，LoadBalancer 默认过滤 `healthy=false` 的实例。
* **Eureka**：需开启 `eureka.client.healthcheck.enabled=true` 保证状态准确。

### 生产环境最佳实践

| 场景 | 建议 |
| ------ | ------ |
| 策略选择 | 默认轮询满足 90% 场景；需权重/区域亲和时自定义或对接 Nacos 权重 |
| 高可用 | 开启重试 + 熔断（Resilience4j/Sentinel），避免单点故障级联 |
| 性能优化 | 启用实例缓存；合理设置连接池超时（`spring.cloud.loadbalancer.retry.max-retries`） |
| 云原生演进 | 微服务规模大或跨集群时，可逐步迁移至 Service Mesh（Istio）实现透明负载均衡 |

## 原理概述

以 **Spring Cloud OpenFeign + Nacos** 为例，底层实现分为 **节点感知**、**负载决策**、**请求拦截与替换** 三个核心阶段。整体架构属于典型的 **客户端负载均衡 + 被动健康同步** 模式。

### 整体调用链路（宏观）

```text
@FeignClient 方法调用
  ↓
FeignBlockingLoadBalancerClient 拦截请求
  ↓
调用 LoadBalancer.choose() → 触发 ServiceInstanceListSupplier 获取实例列表
  ↓
Nacos 本地缓存提供 List<ServiceInstance>（已过滤不健康节点）
  ↓
RoundRobinLoadBalancer 计算目标实例
  ↓
替换 Feign Request URL：http://user-service/api → http://192.168.1.10:8080/api
  ↓
底层 HTTP Client（OkHttp/Apache HttpClient）发起真实请求
```

### 节点感知：Nacos 如何实时同步实例状态

#### 1. Nacos Client 订阅机制（长连接 + 本地缓存）

* **启动拉取**：应用启动时，`NacosNamingService` 通过 HTTP/gRPC（Nacos 2.x 默认 gRPC 长连接）拉取指定服务的全量实例列表。
* **服务端推送**：Nacos Server 维护服务实例变更事件，通过 **gRPC 长连接** 或 **UDP（1.x）** 主动推送增量变更到客户端。
* **本地内存缓存**：客户端将实例列表存储在 `ServiceInfoHolder` 中，包含：

  ```java
  // 关键字段
  private String serviceName;
  private List<Instance> hosts; // 含 ip, port, weight, healthy, metadata
  ```

#### 2. 健康状态过滤（被动同步）

* **Nacos 服务端健康检查**：由 Nacos Server 通过 TCP/HTTP/MySQL 等方式主动探测实例，标记 `healthy=true/false`。
* **客户端不主动探测**：Spring Cloud LoadBalancer **不自行发心跳**，完全依赖 Nacos 推送的 `healthy` 状态。
* **过滤逻辑**：`ServiceInstanceListSupplier` 默认包装 `HealthCheckServiceInstanceListSupplier`，自动剔除 `healthy=false` 的实例。

### 负载分配：LoadBalancer 如何做路由决策

#### 1. 核心接口与默认策略

* **负载均衡器**：`ReactorLoadBalancer<ServiceInstance>`（底层基于 Project Reactor）
* **默认策略**：`RoundRobinLoadBalancer`

  ```java
  // 简化核心逻辑
  public Mono<Response<ServiceInstance>> choose(Request request) {
      List<ServiceInstance> instances = supplier.get().collectList().block();
      int position = this.position.incrementAndGet(); // AtomicLong 线程安全
      int index = Math.abs(position) % instances.size();
      return Mono.just(new DefaultResponse<>(instances.get(index)));
  }
  ```

  > 📌 注意：默认轮询 **不感知 Nacos 权重**。若需加权轮询，需引入 `spring-cloud-starter-alibaba-nacos-loadbalancer` 或自定义 `ReactorLoadBalancer`。

#### 2. 策略执行流程

1. `LoadBalancerClientFactory` 按服务名隔离配置
2. 调用 `ServiceInstanceListSupplier.get()` 获取实例流（`Flux<List<ServiceInstance>>`）
3. 过滤不健康实例、按元数据排序
4. 交由 `ReactorLoadBalancer` 计算目标节点
5. 返回 `Response<ServiceInstance>` 供上层使用

### Feign 集成：请求拦截与 URL 动态替换

#### 1. 拦截器注入

Spring Cloud 自动配置 `FeignBlockingLoadBalancerClient`，替换 Feign 默认的 `Client.Default`：

```java
public class FeignBlockingLoadBalancerClient implements Client {
    private final LoadBalancerClient loadBalancerClient;
    
    public Response execute(Request request, Request.Options options) {
        URI originalUri = URI.create(request.url());
        String serviceId = originalUri.getHost(); // 如 "user-service"
        
        // 1. 负载均衡选节点
        ServiceInstance instance = loadBalancerClient.choose(serviceId);
        
        // 2. 替换 URL
        String reconstructedUrl = loadBalancerClient.reconstructURI(instance, originalUri).toString();
        Request newRequest = Request.create(..., reconstructedUrl, ...);
        
        // 3. 交给底层 HTTP Client 执行
        return delegate.execute(newRequest, options);
    }
}
```

#### 2. URL 替换规则

* 输入：`http://user-service/api/users?role=admin`
* 选中实例：`192.168.1.10:8080`
* 输出：`http://192.168.1.10:8080/api/users?role=admin`

> Path、Query、Header 完全保留，仅替换 `Host:Port`

### 动态更新与缓存机制

| 机制 | 说明 | 默认值/行为 |
| ------ | ------ | ------------- |
| **本地缓存** | `CachingServiceInstanceListSupplier` 缓存实例列表，避免频繁请求注册中心 | TTL `30s`，可配置 `spring.cloud.loadbalancer.cache.ttl` |
| **变更感知** | Nacos 推送 → 更新 `ServiceInfoHolder` → `ServiceInstanceListSupplier` 触发 Flux 更新 | 下次 `choose()` 自动使用新列表 |
| **故障处理** | 客户端 **无主动剔除** 机制，依赖 Nacos 服务端健康检查标记 `healthy=false` | 配合 `spring-retry` 或 `Resilience4j` 实现调用失败重试/熔断 |

### 核心源码映射（Debug/排查指引）

| 职责 | 关键类 | 包路径 |
|------|--------|--------|
| Nacos 实例管理 | `NacosNamingService` → `ServiceInfoHolder` | `com.alibaba.nacos.client.naming` |
| Spring Cloud 适配 | `NacosServiceInstanceListSupplier` | `com.alibaba.cloud.nacos.discovery` |
| 负载均衡器工厂 | `LoadBalancerClientFactory` | `org.springframework.cloud.loadbalancer.core` |
| 默认策略 | `RoundRobinLoadBalancer` | `org.springframework.cloud.loadbalancer.core` |
| Feign 拦截器 | `FeignBlockingLoadBalancerClient` | `org.springframework.cloud.openfeign.loadbalancer` |
| URL 重建 | `LoadBalancerUriTools.reconstructURI()` | `org.springframework.cloud.loadbalancer.support` |

### 生产环境关键注意事项

1. **权重不生效**：默认轮询忽略 Nacos 实例权重。需：
   * 引入 `spring-cloud-starter-alibaba-nacos-loadbalancer`
   * 或自定义 `@LoadBalancerClient` 实现 `WeightedRoundRobinLoadBalancer`

2. **缓存延迟导致请求失败**：实例下线后，Nacos 推送可能有 1~3s 延迟，期间可能路由到已下线节点。**必须配置重试机制**：

   ```yaml
   spring:
     cloud:
       loadbalancer:
         retry:
           enabled: true
           max-retries: 2
       openfeign:
         client:
           config:
             default:
               connect-timeout: 2000
               read-timeout: 5000
   ```

3. **跨可用区路由**：若需同机房优先，需自定义 `ServiceInstanceListSupplier` 实现 `ZonePreferenceServiceInstanceListSupplier` 逻辑。

4. **长连接场景不适用**：Websocket/gRPC 长连接建立后不再经过 Feign 拦截，需在连接建立层自行实现 LB（如 gRPC 内置 LB 或 Istio）。
