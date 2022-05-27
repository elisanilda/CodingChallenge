import {
  Mutation,
  Resolver,
  Arg,
  InputType,
  ObjectType,
  Field,
  Query,
  UseMiddleware,
  Ctx,
} from "type-graphql";
import { getRepository, Repository } from "typeorm";
import { Author } from "../entity/author.entity";
import { Book } from "../entity/book.entity";
import { Length, validate } from "class-validator";
import { IContext, isAuth } from "../middlewares/auth.middleware";
import { User } from "../entity/user.entity";

@InputType()
class BookInput {
  @Field()
  @Length(3, 64)
  title!: string;

  @Field()
  author!: number;
}

@InputType()
class BookUpdateInput {
  @Field(() => String, { nullable: true })
  @Length(3, 64)
  title?: string;

  @Field(() => Number, { nullable: true })
  author?: number;
}

@InputType()
class BookUpdateParsedInput {
  @Field(() => String, { nullable: true })
  @Length(3, 64)
  title?: string;

  @Field(() => Author, { nullable: true })
  author?: Author;
}

@InputType()
class BookIdInput {
  @Field(() => Number)
  id!: number;
}

@ObjectType()
class BookReturnResponse {
  @Field()
  paysFine!: Boolean;

  @Field()
  message!: String;
}

@Resolver()
export class BookResolver {
  bookRepository: Repository<Book>;
  authorRepository: Repository<Author>;
  userRepository: Repository<User>;

  constructor() {
    this.bookRepository = getRepository(Book);
    this.authorRepository = getRepository(Author);
    this.userRepository = getRepository(User);
  }

  @Mutation(() => Book)
  @UseMiddleware(isAuth)
  async createBook(
    @Arg("input", () => BookInput) input: BookInput,
    @Ctx() context: IContext
  ) {
    try {
      console.log(context.payload);
      const author: Author | undefined = await this.authorRepository.findOne(
        input.author
      );

      if (!author) {
        const error = new Error();
        error.message =
          "The author for this book does not exist, please double check";
        throw error;
      }

      const book = await this.bookRepository.insert({
        title: input.title,
        author: author,
      });

      return await this.bookRepository.findOne(book.identifiers[0].id, {
        relations: ["author", "author.books"],
      });
    } catch (e) {
      throw new Error(e.message);
    }
  }

  @Query(() => [Book])
  @UseMiddleware(isAuth)
  async getAllBooks(): Promise<Book[]> {
    try {
      return await this.bookRepository.find({
        relations: ["author", "author.books"],
      });
    } catch (e) {
      throw new Error(e);
    }
  }

  @Query(() => Book)
  async getBookById(
    @Arg("input", () => BookIdInput) input: BookIdInput
  ): Promise<Book | undefined> {
    try {
      return await this.findBookById(input.id);
    } catch (e) {
      throw new Error(e);
    }
  }

  @Mutation(() => Boolean)
  async updateBookById(
    @Arg("bookId", () => BookIdInput) bookId: BookIdInput,
    @Arg("input", () => BookUpdateInput) input: BookUpdateInput
  ): Promise<Boolean> {
    try {
      await this.bookRepository.update(bookId.id, await this.parseInput(input));
      return true;
    } catch (e) {
      throw new Error(e);
    }
  }

  @Mutation(() => Boolean)
  async deleteBook(
    @Arg("bookId", () => BookIdInput) bookId: BookIdInput
  ): Promise<Boolean> {
    try {
      const result = await this.bookRepository.delete(bookId.id);

      if (result.affected === 0) throw new Error("Book does not exist");

      return true;
    } catch (e) {
      throw new Error(e);
    }
  }

  @Query(() => Boolean)
  async isOnLoan(
    @Arg("input", () => BookIdInput) input: BookIdInput
  ): Promise<boolean | undefined> {
    try {
      const book = await this.findBookById(input.id);
      return book.isOnLoan;
    } catch (e) {
      throw new Error(e);
    }
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async loanBook(
    @Arg("bookId", () => BookIdInput) bookId: BookIdInput,
    @Ctx() ctx: IContext
  ): Promise<Boolean> {
    try {
      const book = await this.findBookById(bookId.id);
      const user = await this.getLoggedUser(ctx.payload.userId);
      await this.validateUserCanLoanBook(user, book);

      book.isOnLoan = true;
      user.loanedBooks.push(book);
      book.loanedBy = user;

      await this.bookRepository.save(book);
      await this.userRepository.save(user);

      return true;
    } catch (e) {
      throw new Error(e);
    }
  }

  @Mutation(() => BookReturnResponse)
  @UseMiddleware(isAuth)
  async returnBook(
    @Arg("bookId", () => BookIdInput) bookId: BookIdInput,
    @Ctx() ctx: IContext
  ): Promise<BookReturnResponse> {
    try {
      const book = await this.findBookById(bookId.id);
      const user = await this.getLoggedUser(ctx.payload.userId);

      await this.validateBookCanBeReturnedByUser(book, user);

      const fine = await this.shouldPayFine(book);

      let message = "Book returned on time. No fine applied.";
      if (fine) {
        message = "User must pay the fine for passing 7 days.";
      }

      book.isOnLoan = false;
      user.loanedBooks.splice(user.loanedBooks.indexOf(book), 1);
      book.loanedBy = null;

      await this.bookRepository.save(book);
      await this.userRepository.save(user);

      return {
        paysFine: fine,
        message: message,
      };
    } catch (e) {
      throw new Error(e);
    }
  }

  @Query(() => [Book])
  @UseMiddleware(isAuth)
  async getAllAvailableBooks(): Promise<Book[]> {
    try {
      return await this.bookRepository.find({
        relations: ["author", "author.books"],
        where: { isOnLoan: false },
      });
    } catch (e) {
      throw new Error(e);
    }
  }

  private async shouldPayFine(book: Book) {
    const today = new Date();
    const diffMillisec = today.getTime() - (book.loanDate as Date).getTime();
    const diffDates = diffMillisec / (1000 * 3600 * 24);
    return diffDates > 7;
  }

  private async validateUserCanLoanBook(user: User, book: Book) {
    if (book.isOnLoan) {
      const error = new Error();
      error.message = "Book is already on loan.";
      throw error;
    }

    if (user.loanedBooks.length == 3) {
      const error = new Error();
      error.message = "The user cannot loan more than 3 books.";
      throw error;
    }
    return true;
  }

  private async validateBookCanBeReturnedByUser(book: Book, user: User) {
    if (!book.isOnLoan) {
      const error = new Error();
      error.message = "Book is not on loan.";
      throw error;
    }

    if (user.loanedBooks.indexOf(book) === -1) {
      const error = new Error();
      error.message = "This user has not loaned this book.";
      throw error;
    }
    return true;
  }

  private async getLoggedUser(userId: number) {
    const user = await this.userRepository.findOne(userId);

    if (!user) {
      const error = new Error();
      error.message = "User does not exist!";
      throw error;
    }
    return user;
  }

  private async findBookById(bookId: number) {
    const book = await this.bookRepository.findOne(bookId, {
      relations: ["author", "author.books"],
    });

    if (!book) {
      const error = new Error();
      error.message = "Book not found";
      throw error;
    }

    return book;
  }

  private async parseInput(input: BookUpdateInput) {
    try {
      const _input: BookUpdateParsedInput = {};

      if (input.title) {
        _input["title"] = input.title;
      }

      if (input.author) {
        const author = await this.authorRepository.findOne(input.author);
        if (!author) {
          throw new Error("This author does not exist.");
        }
        _input["author"] = await this.authorRepository.findOne(input.author);
      }

      return _input;
    } catch (e) {
      throw new Error(e);
    }
  }
}
