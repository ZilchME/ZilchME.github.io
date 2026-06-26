---
title: Spring @Configuration 注解与 Bean 配置
tags:
  - Spring
createTime: 2026/06/26 15:46:44
permalink: /blog/gdrqq61c/
---

在 Spring 框架中，基于 Java 的配置方式已经成为主流，它取代了早期繁琐的 XML 配置文件。而这一切的核心，就是 `@Configuration` 注解和 `@Bean` 注解。理解它们的工作原理，是掌握 Spring IoC 容器的关键一步。本文将深入探讨 `@Configuration` 的作用、它与普通 `@Component` 的本质区别，以及如何通过多种方式配置和管理 Bean。

## `@Configuration` 注解

`@Configuration` 注解用于修饰一个 Java 类，表明该类是 Spring 的配置类。它的作用等同于传统 XML 配置文件中的 `<beans>` 根元素。Spring 容器在启动时会扫描并处理这些类，解析其中的 Bean 定义，并完成实例化和依赖注入。

一个典型的配置类如下：

```java
@Configuration
public class AppConfig {

    @Bean
    public TransferService transferService() {
        return new TransferServiceImpl();
    }
}
```

上述代码等价于 XML 配置：

```xml
<beans>
    <bean id="transferService" class="com.example.TransferServiceImpl"/>
</beans>
```

使用 `@Configuration` 的优势在于类型安全、易于重构，并且能够利用 Java 语言的特性（如条件判断、循环等）来动态决定 Bean 的创建逻辑。

## `@Bean` 注解

`@Bean` 注解标注在方法上，表示该方法的返回值将被注册为 Spring 容器中的一个 Bean。默认情况下，Bean 的名称就是方法名，但可以通过 `@Bean(name = "customName")` 自定义。

`@Bean` 方法可以包含参数，Spring 会自动从容器中查找匹配类型的 Bean 注入进来，实现了配置类内部的依赖装配：

```java
@Configuration
public class AppConfig {

    @Bean
    public AccountRepository accountRepository() {
        return new JdbcAccountRepository();
    }

    @Bean
    public TransferService transferService(AccountRepository accountRepository) {
        return new TransferServiceImpl(accountRepository);
    }
}
```

这里的 `transferService` 方法声明依赖 `AccountRepository`，Spring 会调用 `accountRepository()` 方法（实际上是容器管理的 Bean）来完成注入。

## CGLIB 代理与单例保真

这是 `@Configuration` 最为关键的特性。当 Spring 处理标注了 `@Configuration` 的类时，并不会直接使用该类本身，而是通过 CGLIB 为其生成一个动态代理子类。这个代理类会拦截所有 `@Bean` 方法的调用，从而确保每次调用该方法时，返回的都是容器中已存在的那个单例 Bean，而不是重新执行方法体创建新对象。

*[CGLIB]: Code Generation Library

考虑如下场景：

```java
@Configuration
public class AppConfig {

    @Bean
    public TransferService transferService() {
        System.out.println("Creating TransferService");
        return new TransferServiceImpl();
    }

    @Bean
    public PaymentService paymentService() {
        // 直接调用 transferService() 方法
        TransferService ts = transferService();
        return new PaymentService(ts);
    }
}
```

如果 `AppConfig` 被当作普通类运行，那么每次调用 `transferService()` 都会输出 "Creating TransferService" 并新建对象，`paymentService` 中持有的 `TransferService` 将与容器中注册的不是同一个实例，破坏了单例模式。

但由于 `@Configuration` 的存在，Spring 生成的代理会在首次调用 `transferService()` 时创建 Bean 并缓存，后续所有调用（无论是在配置类内部还是外部）都直接从缓存中返回。因此，上面的代码只会输出一次 "Creating TransferService"，且所有地方共享同一个 Bean 实例。

## Full 模式与 Lite 模式：`proxyBeanMethods` 属性

从 Spring 5.2 开始，`@Configuration` 提供了一个 `proxyBeanMethods` 属性（默认为 `true`），用于控制是否生成 CGLIB 代理。

- **Full 模式（`proxyBeanMethods = true`）**：生成代理，保证 `@Bean` 方法之间调用的单例语义。这是默认行为，适用于配置类中方法相互调用较多的场景。
- **Lite 模式（`proxyBeanMethods = false`）**：不生成代理，Spring 将类当作普通的 `@Component` 处理，`@Bean` 方法调用就是普通的 Java 方法调用，不会经过容器缓存。这种模式下，如果配置类内部方法相互调用，可能会导致多例问题，但启动速度更快，内存占用更少。

如果你确定配置类内部没有 `@Bean` 方法的相互调用，或者不依赖于单例保证，可以显式设置为 `false` 以提升性能：

```java
@Configuration(proxyBeanMethods = false)
public class FastAppConfig {
    // ...
}
```

许多 Spring Boot 自动配置类都采用了 `proxyBeanMethods = false`，因为自动配置通常较为独立，不需要内部方法交互。

## 处理多个相同类型的 Bean

当容器中存在多个同类型 Bean 时（例如多个 `TransferService` 实现），注入时需要明确指定具体使用哪一个。常用的策略有三种：

### 使用 `@Qualifier` 按名称注入

在注入点配合 `@Qualifier` 注解，指定 Bean 的名称（即 `@Bean` 方法名或自定义名称）：

```java
@Component
public class UserService {

    // 字段注入
    @Autowired
    @Qualifier("advancedTransferService")  // 指定要注入的 Bean 名称
    private TransferService transferServiceByField;

    private final TransferService transferServiceByConstructor;

    // 构造器注入
    // 如果类只有一个构造器，@Autowired 可以省略（Spring 4.3+ 自动注入）。
    // 但为了明确性，此处保留 @Autowired
    @Autowired
    public UserService(@Qualifier("advancedTransferService") TransferService transferServiceByConstructor) {
        this.transferServiceByConstructor = transferServiceByConstructor;
    }
}
```

### 使用 `@Primary` 设置首选 Bean

在某个 Bean 定义上添加 `@Primary`，当没有指定 `@Qualifier` 时，容器默认注入该 Bean：

```java
@Configuration
public class AppConfig {
    @Primary
    @Bean
    public TransferService defaultTransferService() {
        return new TransferServiceImpl();
    }

    @Bean
    public TransferService advancedTransferService() {
        return new AdvancedTransferServiceImpl();
    }
}
```

此时，若注入时不加 `@Qualifier`，则注入 `defaultTransferService`。

### 注入所有实现，动态选择

可以将所有同类型 Bean 注入到一个 `Map<String, TransferService>` 或 `List` 中，然后根据业务逻辑动态选取：

```java
@Component
public class TransferRouter {
    private final Map<String, TransferService> serviceMap;

    public TransferRouter(Map<String, TransferService> serviceMap) {
        this.serviceMap = serviceMap;
    }

    public TransferService select(String type) {
        return serviceMap.get(type + "TransferService");
    }
}
```

## 在配置类内部注入其他 Bean

在同一个配置类中，除了通过方法参数装配外，还可以直接使用 `@Autowired` 或构造器注入（前提是配置类本身也是一个 Bean）。但 Spring 推荐使用方法参数的方式，因为它明确表达了依赖关系，且不需要额外的注解：

```java
@Configuration
public class AppConfig {
    @Bean
    public ServiceA serviceA(ServiceB serviceB) {
        return new ServiceA(serviceB);
    }

    @Bean
    public ServiceB serviceB() {
        return new ServiceB();
    }
}
```

这种写法比直接调用 `serviceB()` 更符合 Spring 的依赖注入思想，并且即使 `proxyBeanMethods = false`，也能保证正确注入。
