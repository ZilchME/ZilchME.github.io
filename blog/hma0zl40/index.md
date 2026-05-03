---
url: /blog/hma0zl40/index.md
---
在数据处理时有时会用到像是如下所示的代码，初次了解时会比较迷惑。

```python
day_of_year = pd.to_datetime(pumpkins['Date']).apply(lambda dt: (dt - datetime(dt.year, 1, 1)).days)
```

## Lambda 表达式

Lambda表达式是一种匿名函数，也称为"匿名函数"或" Lambda 函数"。它是一种简洁的方式来定义简单的函数，通常用于函数式编程范式中。

在 Python 中，Lambda 表达式的语法如下：

```python
lambda arguments: expression
```

其中，`lambda`是关键字，`arguments`是输入参数，可以是零个或多个，用逗号分隔，而`expression`是函数体，即函数的计算逻辑。Lambda 函数可以接受任意数量的参数，但它只能包含一个表达式。

Lambda表达式具有以下特点：

1. 匿名性：Lambda 函数是匿名的，它没有命名，因此通常用于简单的临时操作，而不是为复杂的功能定义命名函数。

2. 简洁性：Lambda 表达式的语法非常简洁，适合用于单行函数的定义，以及需要传递函数作为参数的情况。

3. 返回值：Lambda 函数会自动返回表达式的计算结果，无需使用`return`关键字。

使用 Lambda 表达式的常见场景包括：

* 作为参数传递给高阶函数，例如`map()`、`filter()`和`sorted()`等。
* 用于定义简单的转换或过滤逻辑，以替代定义完整的命名函数。

## `map()` 函数

`map()`函数是 Python 内置函数之一，它用于将一个函数应用于给定的可迭代对象（如列表、元组等）的所有元素，生成一个新的可迭代对象，其中包含经过函数处理后的结果。

`map()`函数的语法如下：

```python
map(function, iterable, ...)
```

* `function`：这是一个函数，可以是 Python 内置函数、自定义函数或 Lambda 表达式。`map()`将这个函数应用于`iterable`中的每个元素。

* `iterable`：这是一个可迭代对象，如列表、元组、集合等。`map()`会对`iterable`中的每个元素都调用`function`进行处理。

`map()`函数会返回一个`map`对象，它是一个惰性求值的对象，意味着在实际需要结果时才会计算并返回。要将`map`对象转换为列表或其他类型的可迭代对象，可以使用`list()`、`tuple()`等函数进行转换。

## 举例

1.使用 Lambda 表达式对列表中的元素进行平方操作：

```python
numbers = [1, 2, 3, 4, 5]
squared_numbers = list(map(lambda x: x ** 2, numbers))
print(squared_numbers)  # 输出: [1, 4, 9, 16, 25]
```

2.使用 Lambda 表达式对列表中的偶数进行过滤：

```python
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
even_numbers = list(filter(lambda x: x % 2 == 0, numbers))
print(even_numbers)  # 输出: [2, 4, 6, 8, 10]
```

3.使用 Lambda 表达式定义一个简单的计算器函数：

```python
# 定义一个简单的计算器函数，接受操作符和两个操作数，并执行相应的操作
calculator = lambda op, a, b: a + b if op == '+' else a - b if op == '-' else a * b

print(calculator('+', 5, 3))  # 输出: 8
print(calculator('-', 10, 4))  # 输出: 6
print(calculator('*', 2, 6))  # 输出: 12
```

在最开始的例子中，`apply()`函数的作用类似于`map()`

```python
day_of_year = pd.to_datetime(pumpkins['Date']).apply(lambda dt: (dt - datetime(dt.year, 1, 1)).days)
```

1. `pd.to_datetime(pumpkins['Date'])`: 这部分代码将`pumpkins` DataFrame中的'Date'列转换为pandas中的日期时间格式。`pd.to_datetime()`是pandas的一个函数，它将给定的日期字符串转换为日期时间对象，这样可以在之后进行日期的计算和处理。

2. `apply(lambda dt: (dt - datetime(dt.year, 1, 1)).days)`: 这是对转换后的日期时间对象进行操作。`apply()`是pandas DataFrame对象的一个方法，它允许我们对DataFrame的每个元素应用一个函数。在这里，我们使用了一个lambda函数来计算每个日期在一年中的第几天。

   * `lambda dt: (dt - datetime(dt.year, 1, 1))`: 这个lambda函数接受一个日期时间对象`dt`作为输入，并计算该日期时间对象与当年1月1日之间的时间差，得到一个`timedelta`对象。这个时间差表示该日期距离当年的1月1日有多少天。

   * `.days`: `timedelta`对象有一个属性`.days`，表示该时间差的天数部分。

因此，整个代码的目的是将`pumpkins` DataFrame中的'Date'列转换为日期时间格式，然后计算每个日期在一年中的第几天，并将结果保存在名为`day_of_year`的新列中。这样可以方便地了解每个日期在一年中的位置，用于后续的时间分析和处理。
