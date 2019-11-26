# lodapr
Batch transformations of result sets - functional stylee

[![CircleCI](https://circleci.com/gh/sloops77/lodapr.svg?style=svg)](https://circleci.com/gh/sloops77/lodapr)
[![codecov](https://codecov.io/gh/sloops77/lodapr/branch/master/graph/badge.svg)](https://codecov.io/gh/sloops77/lodapr)

The problem is that doing async programming is that it can be super slow as you wait for an API call, databases, or some other sort of I/O. But of course you already know that the make it fly you gotta process your data in parallel. But handling the complexity of all the async logic with Promises or callbacks is incredibly tricky. 

You need a higher level extraction and that's where lodapr comes in.

Lodapr helps you out by allowing you to program you transformations in parallel and extra a final set of results out. In lodapr, errors don't kill your processing flow like they would if you used Promise.all. That's because errors are ignored and batched up to be handled at the end of your flow.
